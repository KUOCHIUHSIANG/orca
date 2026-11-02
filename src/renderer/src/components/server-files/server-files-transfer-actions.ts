import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { shouldOverwriteConflict } from '../../../../shared/server-files-overwrite-policy'
import { remoteBaseName } from '../../../../shared/server-files-paths'
import type { TransferPlan } from '../../../../shared/server-files-types'
import { refreshPanes } from './server-files-navigation'
import { errorSummary, formatBytes } from './server-files-messages'
import type { ServerFilesPrompts } from './server-files-prompts-context'
import { joinLocalPath, runServerJob } from './server-files-run-job'
import { profileById } from './server-files-store'
import type { ConflictAnswer } from './TransferConflictDialog'

function discard(plan: TransferPlan): void {
  void window.api.serverFiles.discardPlan({ planId: plan.planId })
}

/** Conflicts first, then (uploads) the separate confirmation for protected files. */
async function decide(
  prompts: ServerFilesPrompts,
  plan: TransferPlan
): Promise<(ConflictAnswer & { protectedConfirmed: boolean }) | null> {
  const answer: ConflictAnswer | null =
    plan.conflicts.length > 0
      ? await prompts.resolveConflicts(plan)
      : { policy: 'skip', overwrite: [] }
  if (!answer) {
    return null
  }
  const chosen = new Set(answer.overwrite)
  const guarded = plan.conflicts.filter(
    (conflict) => conflict.protected && shouldOverwriteConflict(conflict, answer.policy, chosen)
  )
  if (guarded.length === 0) {
    return { ...answer, protectedConfirmed: false }
  }
  const confirmed = await prompts.confirmPaths({
    title: translate(
      'auto.components.serverFiles.upload.protectedTitle',
      'Overwrite {{value0}} files under a protected path?',
      { value0: guarded.length }
    ),
    message: translate(
      'auto.components.serverFiles.upload.protectedMessage',
      'These files are protected. They cannot be deleted from here, but a deploy may overwrite them once you confirm.'
    ),
    paths: guarded.map((conflict) => ({ path: conflict.destinationPath })),
    confirmLabel: translate('auto.components.serverFiles.upload.protectedConfirm', 'Overwrite'),
    destructive: true
  })
  return confirmed ? { ...answer, protectedConfirmed: true } : null
}

export async function uploadToServer(
  prompts: ServerFilesPrompts,
  serverId: string,
  sources: string[],
  destinationDir: string,
  mode: 'items' | 'contents'
): Promise<void> {
  const result = await window.api.serverFiles.planUpload({
    serverId,
    sources,
    destinationDir,
    mode
  })
  if (!result.ok) {
    toast.error(errorSummary(result.error))
    return
  }
  const plan = result.value
  if (plan.fileCount === 0) {
    discard(plan)
    toast(translate('auto.components.serverFiles.upload.nothing', 'There are no files to upload'))
    return
  }
  if (plan.freeBytes !== null && plan.totalBytes > plan.freeBytes) {
    const proceed = await prompts.confirmPaths({
      title: translate(
        'auto.components.serverFiles.upload.spaceTitle',
        'The server may not have enough space'
      ),
      message: translate(
        'auto.components.serverFiles.upload.spaceMessage',
        'The upload is {{value0}}, but only {{value1}} is free there.',
        { value0: formatBytes(plan.totalBytes), value1: formatBytes(plan.freeBytes) }
      ),
      paths: [{ path: destinationDir }],
      confirmLabel: translate('auto.components.serverFiles.upload.spaceConfirm', 'Upload anyway')
    })
    if (!proceed) {
      discard(plan)
      return
    }
  }
  const decision = await decide(prompts, plan)
  if (!decision) {
    discard(plan)
    return
  }
  await runServerJob({
    serverId,
    kind: 'upload',
    title: translate('auto.components.serverFiles.upload.jobTitle', 'Upload to {{value0}}', {
      value0: destinationDir
    }),
    retry: () => void uploadToServer(prompts, serverId, sources, destinationDir, mode),
    execute: (jobId) =>
      window.api.serverFiles.executeTransfer({ planId: plan.planId, jobId, ...decision })
  })
  await refreshPanes(serverId, [destinationDir])
}

export async function chooseDownloadFolder(serverId: string): Promise<string | null> {
  const profile = profileById(serverId)
  const defaults = await window.api.serverFiles.localDefaults()
  const result = await window.api.serverFiles.pickLocal({
    kind: 'folder',
    defaultPath: profile?.downloadDir || (defaults.ok ? defaults.value.downloadsDir : '')
  })
  return result.ok ? (result.value[0] ?? null) : null
}

export async function downloadFromServer(
  prompts: ServerFilesPrompts,
  serverId: string,
  sources: string[],
  folder?: string
): Promise<void> {
  let destinationDir = folder ?? profileById(serverId)?.downloadDir ?? ''
  if (!destinationDir) {
    const defaults = await window.api.serverFiles.localDefaults()
    destinationDir = defaults.ok ? defaults.value.downloadsDir : ''
  }
  const result = await window.api.serverFiles.planDownload({ serverId, sources, destinationDir })
  if (!result.ok) {
    toast.error(errorSummary(result.error))
    return
  }
  const plan = result.value
  const decision = await decide(prompts, plan)
  if (!decision) {
    discard(plan)
    return
  }
  const firstLocal = joinLocalPath(destinationDir, remoteBaseName(sources[0]))
  const outcome = await runServerJob({
    serverId,
    kind: 'download',
    title: translate('auto.components.serverFiles.download.jobTitle', 'Download to {{value0}}', {
      value0: destinationDir
    }),
    localPath: firstLocal,
    retry: () => void downloadFromServer(prompts, serverId, sources, folder),
    execute: (jobId) =>
      window.api.serverFiles.executeTransfer({ planId: plan.planId, jobId, ...decision })
  })
  if (outcome?.status === 'done') {
    toast.success(
      translate('auto.components.serverFiles.download.done', 'Downloaded to {{value0}}', {
        value0: destinationDir
      }),
      {
        action: {
          label: translate('auto.components.serverFiles.download.show', 'Show in folder'),
          onClick: () => void window.api.serverFiles.showInFolder({ path: firstLocal })
        }
      }
    )
  }
}
