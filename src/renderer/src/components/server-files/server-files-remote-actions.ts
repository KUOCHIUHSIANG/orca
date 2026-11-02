import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { isSameOrInsideRemotePath, remoteParentPath } from '../../../../shared/server-files-paths'
import type {
  CopyPlanRequest,
  RemoteEntry,
  ServerProfileSummary
} from '../../../../shared/server-files-types'
import { navigatePane, refreshPanes, setSplitView } from './server-files-navigation'
import { errorSummary, removeBlockReason } from './server-files-messages'
import type { ServerFilesPrompts } from './server-files-prompts-context'
import { runServerJob } from './server-files-run-job'
import { profileById, toProfile, useServerFilesStore } from './server-files-store'

export async function removeFromServer(
  prompts: ServerFilesPrompts,
  serverId: string,
  entries: readonly RemoteEntry[]
): Promise<void> {
  const result = await window.api.serverFiles.planRemove({
    serverId,
    paths: entries.map((entry) => entry.path)
  })
  if (!result.ok) {
    toast.error(errorSummary(result.error))
    return
  }
  const plan = result.value
  if (!plan.planId) {
    await prompts.confirmPaths({
      title: translate(
        'auto.components.serverFiles.remove.blockedTitle',
        'These items cannot be deleted'
      ),
      message: translate(
        'auto.components.serverFiles.remove.blockedMessage',
        'Nothing was deleted. Everything is checked first, so a folder is never left half deleted.'
      ),
      paths: plan.blocked.map((block) => ({
        path: block.path,
        note: removeBlockReason(block.reason)
      })),
      confirmLabel: translate('auto.components.serverFiles.dialog.ok', 'OK'),
      acknowledgeOnly: true
    })
    return
  }
  const planId = plan.planId
  const label = profileById(serverId)?.label ?? ''
  const confirmed = await prompts.confirmPaths({
    title: translate(
      'auto.components.serverFiles.remove.title',
      'Delete {{value0}} items from {{value1}}?',
      {
        value0: plan.items.length,
        value1: label
      }
    ),
    message: translate('auto.components.serverFiles.remove.message', 'This cannot be undone.'),
    paths: plan.items.map((item) => ({
      path: item.kind === 'directory' ? `${item.path}/` : item.path,
      note:
        item.kind === 'directory'
          ? translate(
              'auto.components.serverFiles.remove.folderCounts',
              '{{value0}} files, {{value1}} folders inside',
              {
                value0: item.fileCount,
                value1: item.folderCount
              }
            )
          : undefined
    })),
    confirmLabel: translate('auto.components.serverFiles.remove.confirm', 'Delete'),
    destructive: true
  })
  if (!confirmed) {
    void window.api.serverFiles.discardPlan({ planId })
    return
  }
  await runServerJob({
    serverId,
    kind: 'remove',
    title: translate('auto.components.serverFiles.remove.jobTitle', 'Delete {{value0}} items', {
      value0: plan.items.length
    }),
    execute: (jobId) => window.api.serverFiles.executeRemove({ planId, jobId })
  })
  await refreshPanes(
    serverId,
    entries.map((entry) => remoteParentPath(entry.path))
  )
}

export async function renameOnServer(
  prompts: ServerFilesPrompts,
  serverId: string,
  entry: RemoteEntry,
  siblings: readonly string[]
): Promise<void> {
  const newName = await prompts.askName({
    title: translate('auto.components.serverFiles.rename.title', 'Rename'),
    label: translate('auto.components.serverFiles.rename.label', 'New name'),
    initial: entry.name,
    confirmLabel: translate('auto.components.serverFiles.rename.confirm', 'Rename'),
    taken: siblings
  })
  if (!newName) {
    return
  }
  const result = await window.api.serverFiles.rename({ serverId, path: entry.path, newName })
  if (!result.ok) {
    toast.error(errorSummary(result.error))
  }
  await refreshPanes(serverId, [remoteParentPath(entry.path)])
}

export async function createFolderOnServer(
  prompts: ServerFilesPrompts,
  serverId: string,
  parentDir: string,
  siblings: readonly string[]
): Promise<void> {
  const name = await prompts.askName({
    title: translate('auto.components.serverFiles.mkdir.title', 'New folder'),
    label: translate('auto.components.serverFiles.mkdir.label', 'Folder name'),
    initial: '',
    confirmLabel: translate('auto.components.serverFiles.mkdir.confirm', 'Create'),
    taken: siblings
  })
  if (!name) {
    return
  }
  const result = await window.api.serverFiles.mkdir({ serverId, parentDir, name })
  if (!result.ok) {
    toast.error(errorSummary(result.error))
  }
  await refreshPanes(serverId, [parentDir])
}

/** Server-side copy or backup; afterwards the second pane shows where the copies landed. */
export async function copyOnServer(
  prompts: ServerFilesPrompts,
  request: CopyPlanRequest
): Promise<void> {
  const { serverId } = request
  const result = await window.api.serverFiles.planCopy(request)
  if (!result.ok) {
    toast.error(errorSummary(result.error))
    return
  }
  const plan = result.value
  const discard = (): void => void window.api.serverFiles.discardPlan({ planId: plan.planId })
  const answer = await prompts.confirmCopy(plan)
  if (!answer) {
    discard()
    return
  }
  if (answer.clearLeftovers) {
    const confirmed = await prompts.confirmPaths({
      title: translate(
        'auto.components.serverFiles.copy.clearTitle',
        'Delete {{value0}} items from {{value1}} first?',
        {
          value0: plan.leftovers.length,
          value1: plan.destinationRoot
        }
      ),
      message: translate('auto.components.serverFiles.remove.message', 'This cannot be undone.'),
      paths: plan.leftovers.map((leftover) => ({
        path: leftover.kind === 'directory' ? `${leftover.path}/` : leftover.path
      })),
      confirmLabel: translate(
        'auto.components.serverFiles.copy.clearConfirm',
        'Delete and back up'
      ),
      destructive: true
    })
    if (!confirmed) {
      discard()
      return
    }
  }
  let protectedConfirmed = false
  if (answer.overwriteExisting && plan.protectedOverwrites.length > 0) {
    protectedConfirmed = await prompts.confirmPaths({
      title: translate(
        'auto.components.serverFiles.upload.protectedTitle',
        'Overwrite {{value0}} files under a protected path?',
        {
          value0: plan.protectedOverwrites.length
        }
      ),
      paths: plan.protectedOverwrites.map((path) => ({ path })),
      confirmLabel: translate('auto.components.serverFiles.upload.protectedConfirm', 'Overwrite'),
      destructive: true
    })
    if (!protectedConfirmed) {
      discard()
      return
    }
  }
  const reveal = (): void =>
    void revealCopies(
      serverId,
      plan.destinationRoot,
      plan.items.map((item) => item.destination)
    )
  const outcome = await runServerJob({
    serverId,
    kind: plan.kind,
    title:
      plan.kind === 'backup'
        ? translate('auto.components.serverFiles.copy.backupJob', 'Back up to {{value0}}', {
            value0: plan.destinationRoot
          })
        : translate('auto.components.serverFiles.copy.copyJob', 'Copy to {{value0}}', {
            value0: plan.destinationRoot
          }),
    reveal,
    retry: () => void copyOnServer(prompts, request),
    execute: (jobId) =>
      window.api.serverFiles.executeCopy({
        planId: plan.planId,
        jobId,
        ...answer,
        protectedConfirmed
      })
  })
  await refreshPanes(serverId, [plan.destinationRoot])
  if (outcome?.status === 'done') {
    reveal()
  }
}

async function revealCopies(serverId: string, root: string, destinations: string[]): Promise<void> {
  await setSplitView(serverId, true)
  useServerFilesStore.getState().updateWorkspace(serverId, { activePane: 1 })
  await navigatePane(serverId, 1, root, { highlight: destinations })
}

export async function toggleProtectedPath(
  profile: ServerProfileSummary,
  path: string
): Promise<void> {
  const covered = profile.protectedPaths.includes(path)
  const protectedPaths = covered
    ? profile.protectedPaths.filter((candidate) => candidate !== path)
    : [
        ...profile.protectedPaths.filter((candidate) => !isSameOrInsideRemotePath(candidate, path)),
        path
      ]
  const result = await window.api.serverFiles.saveProfile({
    profile: { ...toProfile(profile), protectedPaths }
  })
  if (!result.ok) {
    toast.error(errorSummary(result.error))
    return
  }
  const store = useServerFilesStore.getState()
  store.setProfiles((store.profiles ?? []).map((p) => (p.id === profile.id ? result.value : p)))
  const session = store.sessions[profile.id]
  if (session?.status === 'connected') {
    const info = await window.api.serverFiles.connect({ serverId: profile.id })
    if (info.ok) {
      store.setSession(profile.id, { status: 'connected', info: info.value })
    }
  }
}
