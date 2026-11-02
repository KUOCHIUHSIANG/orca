import { canOverwriteFile } from '../../shared/server-files-access'
import { mapWithConcurrency } from '../../shared/map-with-concurrency'
import {
  compareModifiedTimes,
  shouldOverwriteConflict
} from '../../shared/server-files-overwrite-policy'
import {
  findProtectedRoot,
  joinRemotePath,
  remoteParentPath
} from '../../shared/server-files-paths'
import type {
  JobOutcome,
  JobProgress,
  JobWarning,
  RemoteIdentity,
  TransferConflict,
  TransferExecuteRequest
} from '../../shared/server-files-types'
import { diagnoseWriteError, fail, ServerFilesFailure } from './server-files-errors'
import { createProgressReporter, throwIfCancelled } from './server-files-jobs'
import { walkLocalSources, type LocalWalkItem } from './server-files-local-walk'
import {
  isNoSuchFile,
  sftpFastPut,
  sftpFilesystemSpace,
  sftpLstat,
  sftpMkdir,
  sftpRealpath,
  sftpSetModifiedTime,
  sftpStat,
  type ServerSftp
} from './server-files-sftp'

const STAT_CONCURRENCY = 16

export type UploadFile = {
  localPath: string
  remotePath: string
  size: number
  modifiedMs: number
  conflict: TransferConflict | null
}

export type UploadDraft = {
  destinationDir: string
  /** Remote folders to create, parents first. */
  folders: string[]
  files: UploadFile[]
  skippedLinks: string[]
  freeBytes: number | null
}

export type TransferContext = {
  sftp: ServerSftp
  identity: RemoteIdentity | null
  protectedRoots: readonly string[]
}

async function remoteStatsOrNull(sftp: ServerSftp, path: string) {
  try {
    return await sftpLstat(sftp, path)
  } catch (error) {
    if (isNoSuchFile(error)) {
      return null
    }
    throw error
  }
}

function depthOf(item: LocalWalkItem): number {
  return item.relativePath.split('/').length
}

export async function draftUpload(
  context: TransferContext,
  sources: readonly string[],
  destinationDir: string,
  mode: 'items' | 'contents' = 'items'
): Promise<UploadDraft> {
  const { sftp, identity, protectedRoots } = context
  const destination = await sftpStat(sftp, destinationDir)
  if (!destination.isDirectory()) {
    fail('not-found', 'The destination is not a folder', destinationDir)
  }
  const canonicalDestination = await sftpRealpath(sftp, destinationDir)
  const { items, skippedLinks } = await walkLocalSources(sources, mode)
  const missing = new Set<string>()
  const folders: string[] = []
  const files: UploadFile[] = []
  const maxDepth = Math.max(0, ...items.map(depthOf))
  // Level by level: once a folder is known to be missing, nothing under it needs a round trip.
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const level = items.filter((item) => depthOf(item) === depth)
    const stats = await mapWithConcurrency(level, STAT_CONCURRENCY, async (item) => {
      const parent = item.relativePath.slice(0, item.relativePath.lastIndexOf('/'))
      return parent && missing.has(parent)
        ? null
        : remoteStatsOrNull(sftp, joinRemotePath(destinationDir, item.relativePath))
    })
    level.forEach((item, index) => {
      const remotePath = joinRemotePath(destinationDir, item.relativePath)
      const existing = stats[index]
      if (item.kind === 'directory') {
        if (existing && !existing.isDirectory()) {
          fail('already-exists', 'A file with this name exists where a folder goes', remotePath)
        }
        if (!existing) {
          missing.add(item.relativePath)
          folders.push(remotePath)
        }
        return
      }
      if (existing?.isDirectory()) {
        fail('already-exists', 'A folder with this name exists where a file goes', remotePath)
      }
      if (existing?.isSymbolicLink()) {
        fail(
          'already-exists',
          'A link exists here; uploading would write into its target',
          remotePath
        )
      }
      const canonical = joinRemotePath(canonicalDestination, item.relativePath)
      files.push({
        localPath: item.localPath,
        remotePath,
        size: item.size,
        modifiedMs: item.modifiedMs,
        conflict: existing
          ? {
              relativePath: item.relativePath,
              destinationPath: remotePath,
              source: { size: item.size, modifiedMs: item.modifiedMs },
              destination: { size: existing.size, modifiedMs: existing.mtime * 1000 },
              newer: compareModifiedTimes(
                { size: item.size, modifiedMs: item.modifiedMs },
                { size: existing.size, modifiedMs: existing.mtime * 1000 }
              ),
              writable: canOverwriteFile(identity, existing),
              protected:
                findProtectedRoot(remotePath, protectedRoots) !== null ||
                findProtectedRoot(canonical, protectedRoots) !== null
            }
          : null
      })
    })
  }
  const space = await sftpFilesystemSpace(sftp, destinationDir)
  return { destinationDir, folders, files, skippedLinks, freeBytes: space?.freeBytes ?? null }
}

/** Applies the user's overwrite choice; conflicts not covered by it are left as they are. */
export function selectFilesToWrite<T extends { conflict: TransferConflict | null }>(
  files: readonly T[],
  decision: Pick<TransferExecuteRequest, 'policy' | 'overwrite' | 'protectedConfirmed'>
): T[] {
  const conflictPaths = new Set(
    files.flatMap((file) => (file.conflict ? [file.conflict.relativePath] : []))
  )
  if (decision.overwrite.some((path) => !conflictPaths.has(path))) {
    fail('invalid', 'The overwrite list names a file that is not in this plan')
  }
  const chosen = new Set(decision.overwrite)
  const selected = files.filter(
    (file) => !file.conflict || shouldOverwriteConflict(file.conflict, decision.policy, chosen)
  )
  if (selected.some((file) => file.conflict?.protected) && !decision.protectedConfirmed) {
    fail('protected', 'Overwriting files under a protected path needs its own confirmation')
  }
  return selected
}

export type JobRun = {
  sftp: ServerSftp
  jobId: string
  signal: AbortSignal
  emit: (progress: JobProgress) => void
}

async function ensureFolder(sftp: ServerSftp, path: string): Promise<void> {
  try {
    await sftpMkdir(sftp, path)
  } catch (error) {
    const now = await remoteStatsOrNull(sftp, path).catch(() => null)
    if (!now?.isDirectory()) {
      throw new ServerFilesFailure(
        await diagnoseWriteError(sftp, remoteParentPath(path), error, path)
      )
    }
  }
}

/** In-place overwrite keeps each file's owner and permissions, as FileZilla does. */
export async function runUpload(
  run: JobRun,
  draft: UploadDraft,
  files: readonly UploadFile[]
): Promise<JobOutcome> {
  const { sftp, signal } = run
  const progress = createProgressReporter(
    {
      jobId: run.jobId,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      totalFiles: files.length
    },
    run.emit
  )
  for (const folder of draft.folders) {
    throwIfCancelled(signal)
    await ensureFolder(sftp, folder)
  }
  let timesNotPreserved = 0
  for (const file of files) {
    throwIfCancelled(signal)
    progress.startFile(file.remotePath)
    try {
      await sftpFastPut(sftp, file.localPath, file.remotePath, (bytes) =>
        progress.setFileBytes(bytes)
      )
    } catch (error) {
      throwIfCancelled(signal)
      throw new ServerFilesFailure(
        await diagnoseWriteError(sftp, remoteParentPath(file.remotePath), error, file.remotePath)
      )
    }
    progress.setFileBytes(file.size)
    progress.finishFile()
    // Keeping the local time makes "overwrite only newer" meaningful on the next deploy.
    await sftpSetModifiedTime(sftp, file.remotePath, file.modifiedMs).catch(() => {
      timesNotPreserved += 1
    })
  }
  const warnings: JobWarning[] =
    timesNotPreserved > 0 ? [{ code: 'times-not-preserved', count: timesNotPreserved }] : []
  return { status: 'done', warnings }
}
