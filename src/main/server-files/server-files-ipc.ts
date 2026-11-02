import {
  findProtectedDescendant,
  findProtectedRoot,
  isValidRemoteEntryName,
  joinRemotePath,
  remoteParentPath
} from '../../shared/server-files-paths'
import type {
  JobOutcome,
  ServerProfileSummary,
  ServerSessionInfo,
  TransferPlan
} from '../../shared/server-files-types'
import { createServerFilesConnection } from './server-files-connection'
import { draftCopy, runCopy, type CopyDraft } from './server-files-copy'
import { draftDownload, runDownload, type DownloadDraft } from './server-files-download'
import { diagnoseWriteError, fail, ServerFilesFailure } from './server-files-errors'
import { emitServerFilesProgress, handleServerFiles as handle } from './server-files-ipc-handle'
import { createProgressReporter, JobRegistry, PlanStore } from './server-files-jobs'
import { listRemoteDirectory } from './server-files-listing'
import { registerServerFilesLocalHandlers } from './server-files-local-ipc'
import {
  canSealServerPasswords,
  hasServerPassword,
  saveServerPassword
} from './server-files-password-store'
import {
  deleteServerProfile,
  getServerProfile,
  listServerProfiles,
  saveServerProfile
} from './server-files-profile-store'
import { draftRemoval, runRemoval, type RemovalStep } from './server-files-remove'
import { canonicalRemotePath } from './server-files-remote-walk'
import * as schemas from './server-files-schemas'
import { ServerFilesSessions } from './server-files-sessions'
import { sftpMkdir, sftpRename, type ServerSftp } from './server-files-sftp'
import { buildServerTerminalCommand } from './server-files-terminal-command'
import {
  draftUpload,
  runUpload,
  selectFilesToWrite,
  type JobRun,
  type UploadDraft
} from './server-files-upload'

type TransferDraft =
  | { serverId: string; direction: 'upload'; draft: UploadDraft }
  | { serverId: string; direction: 'download'; draft: DownloadDraft }

const sessions = new ServerFilesSessions({
  loadProfile: getServerProfile,
  createConnection: createServerFilesConnection
})
const transferPlans = new PlanStore<TransferDraft>()
const removalPlans = new PlanStore<{ serverId: string; steps: RemovalStep[] }>()
const copyPlans = new PlanStore<CopyDraft>()
const jobs = new JobRegistry()

function summary(id: string): ServerProfileSummary {
  const profile = getServerProfile(id) ?? fail('invalid', 'This server no longer exists')
  return { ...profile, hasSavedPassword: hasServerPassword(id) }
}

function writeFailure(sftp: ServerSftp, directory: string, path: string) {
  return async (error: unknown): Promise<never> => {
    throw new ServerFilesFailure(await diagnoseWriteError(sftp, directory, error, path))
  }
}

/** Each job runs on its own channel; cancelling ends that channel, which interrupts the transfer. */
async function runJob(
  serverId: string,
  jobId: string,
  work: (run: JobRun, info: ServerSessionInfo) => Promise<JobOutcome>
): Promise<JobOutcome> {
  const signal = jobs.start(jobId)
  try {
    return await sessions.withJobChannel(serverId, async (sftp, info) => {
      const onAbort = (): void => sftp.end()
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        return await work({ sftp, jobId, signal, emit: emitServerFilesProgress }, info)
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
    })
  } catch (error) {
    if (signal.aborted) {
      return { status: 'cancelled' }
    }
    throw error
  } finally {
    jobs.finish(jobId)
  }
}

function transferPlanView(planId: string, stored: TransferDraft): TransferPlan {
  const { draft } = stored
  return {
    planId,
    serverId: stored.serverId,
    direction: stored.direction,
    destinationDir: draft.destinationDir,
    fileCount: draft.files.length,
    totalBytes: draft.files.reduce((sum, file) => sum + file.size, 0),
    conflicts: draft.files.flatMap((file) => (file.conflict ? [file.conflict] : [])),
    skippedLinks: draft.skippedLinks,
    freeBytes: stored.direction === 'upload' ? stored.draft.freeBytes : null
  }
}

function registerProfileHandlers(): void {
  handle('serverFiles:listProfiles', schemas.NoArgsSchema, async () =>
    listServerProfiles().map((profile) => summary(profile.id))
  )
  handle('serverFiles:canSavePasswords', schemas.NoArgsSchema, async () => canSealServerPasswords())
  handle('serverFiles:saveProfile', schemas.ProfileSaveSchema, async ({ profile, password }) => {
    if (profile.auth !== 'password') {
      saveServerPassword(profile.id, null)
    } else if (password !== undefined) {
      saveServerPassword(profile.id, password)
    }
    saveServerProfile(profile)
    await sessions.refreshProfile(profile.id)
    return summary(profile.id)
  })
  handle('serverFiles:deleteProfile', schemas.ServerOnlySchema, async ({ serverId }) => {
    await sessions.disconnect(serverId)
    saveServerPassword(serverId, null)
    deleteServerProfile(serverId)
  })
}

function registerBrowseHandlers(): void {
  handle('serverFiles:connect', schemas.ServerOnlySchema, ({ serverId }) => sessions.open(serverId))
  handle('serverFiles:disconnect', schemas.ServerOnlySchema, ({ serverId }) =>
    sessions.disconnect(serverId)
  )
  handle('serverFiles:list', schemas.ListSchema, ({ serverId, path }) =>
    sessions.withBrowse(serverId, (sftp, info) =>
      listRemoteDirectory(
        {
          sftp,
          identity: info.identity,
          run: info.identity ? (command) => sessions.run(serverId, command) : null
        },
        path
      )
    )
  )
  handle('serverFiles:mkdir', schemas.MkdirSchema, ({ serverId, parentDir, name }) =>
    sessions.withBrowse(serverId, async (sftp) => {
      if (!isValidRemoteEntryName(name)) {
        fail('invalid', 'This name cannot be used', name)
      }
      const path = joinRemotePath(parentDir, name)
      await sftpMkdir(sftp, path).catch(writeFailure(sftp, parentDir, path))
      return path
    })
  )
  handle('serverFiles:rename', schemas.RenameSchema, ({ serverId, path, newName }) =>
    sessions.withBrowse(serverId, async (sftp, info) => {
      if (!isValidRemoteEntryName(newName)) {
        fail('invalid', 'This name cannot be used', newName)
      }
      const canonical = await canonicalRemotePath(sftp, path)
      for (const candidate of [path, canonical]) {
        if (
          findProtectedRoot(candidate, info.protectedRoots) ||
          findProtectedDescendant(candidate, info.protectedRoots)
        ) {
          fail('protected', 'Items under a protected path cannot be renamed', path)
        }
      }
      const parent = remoteParentPath(path)
      const target = joinRemotePath(parent, newName)
      await sftpRename(sftp, path, target).catch(writeFailure(sftp, parent, path))
      return target
    })
  )
}

function registerTransferHandlers(): void {
  handle('serverFiles:planUpload', schemas.UploadPlanSchema, async (request) => {
    const draft = await sessions.withBrowse(request.serverId, (sftp, info) =>
      draftUpload(
        { sftp, identity: info.identity, protectedRoots: info.protectedRoots },
        request.sources,
        request.destinationDir,
        request.mode
      )
    )
    const stored: TransferDraft = { serverId: request.serverId, direction: 'upload', draft }
    return transferPlanView(transferPlans.put(stored), stored)
  })
  handle('serverFiles:planDownload', schemas.DownloadPlanSchema, async (request) => {
    const draft = await sessions.withBrowse(request.serverId, (sftp) =>
      draftDownload(sftp, request.sources, request.destinationDir)
    )
    const stored: TransferDraft = { serverId: request.serverId, direction: 'download', draft }
    return transferPlanView(transferPlans.put(stored), stored)
  })
  handle('serverFiles:executeTransfer', schemas.TransferExecuteSchema, async (request) => {
    const stored = transferPlans.take(request.planId)
    if (stored.direction === 'upload') {
      const { draft } = stored
      const files = selectFilesToWrite(draft.files, request)
      return runJob(stored.serverId, request.jobId, (run) => runUpload(run, draft, files))
    }
    const { draft } = stored
    const files = selectFilesToWrite(draft.files, request)
    return runJob(stored.serverId, request.jobId, (run) => runDownload(run, draft, files))
  })
}

function registerRemoveAndCopyHandlers(): void {
  handle('serverFiles:planRemove', schemas.RemovePlanSchema, async ({ serverId, paths }) => {
    const draft = await sessions.withBrowse(serverId, (sftp, info) =>
      draftRemoval({ sftp, identity: info.identity, protectedRoots: info.protectedRoots }, paths)
    )
    const planId =
      draft.plan.blocked.length === 0 ? removalPlans.put({ serverId, steps: draft.steps }) : null
    return { ...draft.plan, serverId, planId }
  })
  handle('serverFiles:executeRemove', schemas.PlanJobSchema, async ({ planId, jobId }) => {
    const stored = removalPlans.take(planId)
    return runJob(stored.serverId, jobId, async (run) => {
      const progress = createProgressReporter(
        { jobId, totalBytes: 0, totalFiles: stored.steps.length },
        run.emit
      )
      await runRemoval(run.sftp, stored.steps, run.signal, progress)
      return { status: 'done', warnings: [] }
    })
  })
  handle('serverFiles:planCopy', schemas.CopyPlanSchema, async (request) => {
    const draft = await sessions.withBrowse(request.serverId, (sftp, info) =>
      draftCopy(
        {
          sftp,
          identity: info.identity,
          protectedRoots: info.protectedRoots,
          homePath: info.homePath
        },
        request,
        sessions.profileFor(request.serverId)
      )
    )
    return { ...draft.plan, planId: copyPlans.put(draft) }
  })
  handle('serverFiles:executeCopy', schemas.CopyExecuteSchema, async (request) => {
    const draft = copyPlans.take(request.planId)
    const { serverId } = draft.plan
    return runJob(serverId, request.jobId, (run, info) =>
      runCopy(
        {
          ...run,
          context: {
            sftp: run.sftp,
            identity: info.identity,
            protectedRoots: info.protectedRoots,
            homePath: info.homePath
          },
          exec: (command, options) => sessions.run(serverId, command, options)
        },
        draft,
        request
      )
    )
  })
  handle('serverFiles:discardPlan', schemas.PlanOnlySchema, async ({ planId }) => {
    transferPlans.discard(planId)
    removalPlans.discard(planId)
    copyPlans.discard(planId)
  })
  handle('serverFiles:cancelJob', schemas.JobIdSchema, async ({ jobId }) => jobs.cancel(jobId))
}

function registerTerminalHandlers(): void {
  handle('serverFiles:terminalCommand', schemas.TerminalCommandSchema, async (request) => {
    const info = await sessions.open(request.serverId)
    return buildServerTerminalCommand({
      profile: sessions.profileFor(request.serverId),
      cwd: request.cwd,
      loginShell: info.loginShell,
      localShell: request.localShell,
      prefill: request.prefill
    })
  })
}

export function registerServerFilesHandlers(): void {
  registerProfileHandlers()
  registerBrowseHandlers()
  registerTransferHandlers()
  registerRemoveAndCopyHandlers()
  registerTerminalHandlers()
  registerServerFilesLocalHandlers()
}
