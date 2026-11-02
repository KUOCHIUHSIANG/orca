import { buildServerCopyCommand, withStableLocale } from '../../shared/server-files-copy-command'
import { MODIFIED_TIME_TOLERANCE_MS } from '../../shared/server-files-overwrite-policy'
import {
  findProtectedDescendant,
  findProtectedRoot,
  isSameOrInsideRemotePath,
  joinRemotePath,
  relativeRemotePath,
  remoteBaseName
} from '../../shared/server-files-paths'
import type {
  CopyExecuteRequest,
  CopyItem,
  CopyPlan,
  CopyPlanRequest,
  CopyVerification,
  JobOutcome,
  ServerProfile
} from '../../shared/server-files-types'
import { commandError, fail, ServerFilesFailure } from './server-files-errors'
import { createProgressReporter, throwIfCancelled } from './server-files-jobs'
import { canonicalRemotePath, walkRemoteTree, type WalkedEntry } from './server-files-remote-walk'
import {
  draftRemoval,
  runRemoval,
  type RemovalContext,
  type RemovalStep
} from './server-files-remove'
import { isNoSuchFile, sftpLstat, sftpReaddir, sftpRealpath, sftpStat } from './server-files-sftp'
import type { RunOptions } from './server-files-sessions'
import type { JobRun } from './server-files-upload'
import { entryKind } from './server-files-listing'

const COPY_TIMEOUT_MS = 6 * 60 * 60_000

export type CopyContext = RemovalContext & { homePath: string }

export type CopyDraft = {
  plan: Omit<CopyPlan, 'planId'>
  leftoverSteps: RemovalStep[]
}

async function lstatOrNull(context: CopyContext, path: string) {
  try {
    return await sftpLstat(context.sftp, path)
  } catch (error) {
    if (isNoSuchFile(error)) {
      return null
    }
    throw error
  }
}

function backupTargets(profile: ServerProfile, projectId: string, sources: readonly string[]) {
  const project = profile.projects.find((candidate) => candidate.id === projectId)
  if (!project?.projectPath || !project.backupPath) {
    return fail('invalid', 'Set the project folder and backup folder first')
  }
  return {
    project,
    pairs: sources.map((source) => {
      if (!isSameOrInsideRemotePath(source, project.projectPath)) {
        fail('invalid', 'Only items inside the project folder can be backed up this way', source)
      }
      const relative = relativeRemotePath(project.projectPath, source)
      return {
        source,
        destination: relative ? joinRemotePath(project.backupPath, relative) : project.backupPath
      }
    })
  }
}

async function leftoverRefusal(
  context: CopyContext,
  projectPath: string,
  backupPath: string
): Promise<CopyPlan['leftoversRefusal']> {
  const backup = await sftpRealpath(context.sftp, backupPath).catch(() => backupPath)
  const project = await sftpRealpath(context.sftp, projectPath).catch(() => projectPath)
  if (isSameOrInsideRemotePath(backup, project) || isSameOrInsideRemotePath(project, backup)) {
    return 'overlaps-project'
  }
  for (const candidate of [backup, backupPath]) {
    if (
      findProtectedRoot(candidate, context.protectedRoots) ||
      findProtectedDescendant(candidate, context.protectedRoots)
    ) {
      return 'overlaps-protected'
    }
  }
  return backup === '/' || isSameOrInsideRemotePath(context.homePath, backup)
    ? 'home-or-root'
    : null
}

export async function draftCopy(
  context: CopyContext,
  request: CopyPlanRequest,
  profile: ServerProfile
): Promise<CopyDraft> {
  let destinationRoot: string
  let pairs: { source: string; destination: string }[]
  let leftovers: CopyPlan['leftovers'] = []
  let leftoversRefusal: CopyPlan['leftoversRefusal'] = null
  let leftoverSteps: RemovalStep[] = []
  if (request.kind === 'copy') {
    if (!(await sftpStat(context.sftp, request.destinationDir)).isDirectory()) {
      fail('not-found', 'The destination is not a folder', request.destinationDir)
    }
    destinationRoot = request.destinationDir
    pairs = request.sources.map((source) => ({
      source,
      destination: joinRemotePath(request.destinationDir, remoteBaseName(source))
    }))
  } else {
    const target = backupTargets(profile, request.projectId, request.sources)
    destinationRoot = target.project.backupPath
    pairs = target.pairs
    const existing = await sftpReaddir(context.sftp, destinationRoot).catch((error: unknown) => {
      if (isNoSuchFile(error)) {
        return []
      }
      throw error
    })
    leftovers = existing
      .filter((item) => item.filename !== '.' && item.filename !== '..')
      .map((item) => ({
        path: joinRemotePath(destinationRoot, item.filename),
        kind: entryKind(item.attrs.mode),
        modifiedMs: item.attrs.mtime * 1000
      }))
    if (leftovers.length > 0) {
      leftoversRefusal = await leftoverRefusal(context, target.project.projectPath, destinationRoot)
      if (!leftoversRefusal) {
        const removal = await draftRemoval(
          context,
          leftovers.map((leftover) => leftover.path)
        )
        leftoverSteps = removal.steps
        leftoversRefusal = removal.plan.blocked.length > 0 ? 'not-removable' : null
      }
    }
  }
  const items: CopyItem[] = []
  const protectedOverwrites: string[] = []
  for (const { source, destination } of pairs) {
    if (isSameOrInsideRemotePath(destination, source)) {
      fail('invalid', 'A folder cannot be copied into itself', source)
    }
    const sourceStats = await sftpLstat(context.sftp, source)
    const kind = sourceStats.isDirectory() ? 'directory' : 'file'
    const existing = await lstatOrNull(context, destination)
    if (existing && existing.isDirectory() !== (kind === 'directory')) {
      fail('already-exists', 'Something of a different kind already has this name', destination)
    }
    const canonical = await canonicalRemotePath(context.sftp, destination)
    if (
      existing &&
      (findProtectedRoot(destination, context.protectedRoots) ||
        findProtectedRoot(canonical, context.protectedRoots))
    ) {
      protectedOverwrites.push(destination)
    }
    items.push({
      source,
      destination,
      kind,
      destinationExists: existing !== null,
      command: buildServerCopyCommand({ source, destination, kind })
    })
  }
  return {
    plan: {
      serverId: profile.id,
      kind: request.kind,
      destinationRoot,
      items,
      leftovers,
      leftoversRefusal,
      protectedOverwrites
    },
    leftoverSteps
  }
}

async function verifyCopy(context: CopyContext, item: CopyItem): Promise<CopyVerification> {
  const [source, destination] = await Promise.all([
    walkRemoteTree(context.sftp, item.source),
    walkRemoteTree(context.sftp, item.destination).catch((): WalkedEntry[] => [])
  ])
  const copies = new Map(destination.map((entry) => [entry.relativePath, entry]))
  const mismatches: CopyVerification['mismatches'] = []
  let checkedFiles = 0
  for (const entry of source) {
    if (entry.kind !== 'file') {
      continue
    }
    checkedFiles += 1
    const copy = copies.get(entry.relativePath)
    const path = entry.relativePath
      ? joinRemotePath(item.destination, entry.relativePath)
      : item.destination
    if (!copy) {
      mismatches.push({ path, reason: 'missing' })
    } else if (copy.size !== entry.size) {
      mismatches.push({ path, reason: 'size' })
    } else if (Math.abs(copy.modifiedMs - entry.modifiedMs) > MODIFIED_TIME_TOLERANCE_MS) {
      mismatches.push({ path, reason: 'modified' })
    }
  }
  return { checkedFiles, mismatches }
}

export type CopyRun = JobRun & {
  context: CopyContext
  exec: (command: string, options: RunOptions) => Promise<string>
}

export async function runCopy(
  run: CopyRun,
  draft: CopyDraft,
  request: CopyExecuteRequest
): Promise<JobOutcome> {
  const { context, signal } = run
  if (request.clearLeftovers && draft.plan.leftovers.length > 0) {
    if (draft.plan.leftoversRefusal) {
      fail('protected', 'The backup folder cannot be cleared from here', draft.plan.destinationRoot)
    }
    const clearing = createProgressReporter(
      { jobId: run.jobId, totalBytes: 0, totalFiles: draft.leftoverSteps.length },
      run.emit
    )
    await runRemoval(context.sftp, draft.leftoverSteps, signal, clearing)
  }
  const pending: CopyItem[] = []
  let kept = 0
  for (const item of draft.plan.items) {
    const exists = (await lstatOrNull(context, item.destination)) !== null
    if (exists && !request.overwriteExisting) {
      kept += 1
      continue
    }
    if (
      exists &&
      draft.plan.protectedOverwrites.includes(item.destination) &&
      !request.protectedConfirmed
    ) {
      fail(
        'protected',
        'Overwriting under a protected path needs its own confirmation',
        item.destination
      )
    }
    pending.push(item)
  }
  const progress = createProgressReporter(
    { jobId: run.jobId, totalBytes: 0, totalFiles: pending.length },
    run.emit
  )
  for (const item of pending) {
    throwIfCancelled(signal)
    progress.startFile(item.source)
    let stderr = ''
    try {
      await run.exec(withStableLocale(item.command), {
        signal,
        timeoutMs: COPY_TIMEOUT_MS,
        onStderr: (chunk) => {
          stderr += chunk
        }
      })
    } catch (error) {
      throwIfCancelled(signal)
      const message = stderr || (error instanceof Error ? error.message : String(error))
      throw new ServerFilesFailure(commandError(message, item.source))
    }
    progress.finishFile()
  }
  const verification: CopyVerification = { checkedFiles: 0, mismatches: [] }
  for (const item of pending) {
    const result = await verifyCopy(context, item).catch(() => null)
    verification.checkedFiles += result?.checkedFiles ?? 0
    verification.mismatches.push(...(result?.mismatches ?? []))
  }
  return {
    status: 'done',
    verification,
    warnings: kept > 0 ? [{ code: 'existing-kept', count: kept }] : []
  }
}
