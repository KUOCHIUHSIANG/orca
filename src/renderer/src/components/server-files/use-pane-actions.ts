import { useMemo } from 'react'
import {
  Archive,
  CopyPlus,
  Download,
  FolderInput,
  FolderPlus,
  FolderUp,
  Pencil,
  Shield,
  SquareTerminal,
  Trash2,
  Upload,
  Clipboard,
  type LucideIcon
} from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  canChangeFolder,
  canReadEntries,
  canRemoveOrRename,
  type AccessVerdict
} from '../../../../shared/server-files-access'
import { isSameOrInsideRemotePath } from '../../../../shared/server-files-paths'
import type { RemoteEntry } from '../../../../shared/server-files-types'
import { denyReason } from './server-files-messages'
import { projectForPath } from './server-files-navigation'
import { useServerFilesPrompts } from './server-files-prompts-context'
import {
  copyOnServer,
  createFolderOnServer,
  removeFromServer,
  renameOnServer,
  toggleProtectedPath
} from './server-files-remote-actions'
import { emptyWorkspace, useServerFilesStore, type PaneIndex } from './server-files-store'
import { openServerTerminal } from './server-files-terminal'
import {
  chooseDownloadFolder,
  downloadFromServer,
  uploadToServer
} from './server-files-transfer-actions'

export type PaneActionId =
  | 'upload-files'
  | 'upload-folders'
  | 'upload-contents'
  | 'mkdir'
  | 'download'
  | 'download-to'
  | 'backup'
  | 'copy-across'
  | 'terminal'
  | 'rename'
  | 'remove'
  | 'copy-path'
  | 'protect'

export type PaneAction = {
  label: string
  icon: LucideIcon
  /** Why it is disabled, shown as its tooltip; null when it can run. */
  disabledReason: string | null
  /** The server's permissions could not be checked; it decides. */
  unconfirmed: boolean
  run: () => void
}

function action(
  label: string,
  icon: LucideIcon,
  verdict: AccessVerdict | string | null,
  run: () => void
): PaneAction {
  const reason = typeof verdict === 'string' || verdict === null ? verdict : denyReason(verdict)
  return {
    label,
    icon,
    disabledReason: reason,
    unconfirmed: typeof verdict === 'object' && verdict?.state === 'unknown',
    run
  }
}

export function usePaneActions(serverId: string, index: PaneIndex) {
  const prompts = useServerFilesPrompts()
  const workspace = useServerFilesStore((s) => s.workspaces[serverId]) ?? emptyWorkspace()
  const session = useServerFilesStore((s) => s.sessions[serverId])
  const profile = useServerFilesStore((s) => s.profiles?.find((p) => p.id === serverId) ?? null)

  return useMemo(() => {
    const pane = workspace.panes[index]
    const listing = pane.listing
    const info = session?.status === 'connected' ? session.info : null
    const identity = info?.identity ?? null
    const roots = info?.protectedRoots ?? []
    const selected: RemoteEntry[] =
      listing?.entries.filter((entry) => pane.selected.includes(entry.path)) ?? []
    const other = workspace.split ? workspace.panes[index === 0 ? 1 : 0] : null
    const notReady = translate('auto.components.serverFiles.actions.notReady', 'Still loading')
    const pickFirst = translate(
      'auto.components.serverFiles.messages.noSelection',
      'Select an item first'
    )

    const change = listing ? canChangeFolder(listing, identity) : notReady
    const removal = listing ? canRemoveOrRename(listing, selected, identity, roots) : notReady
    const read = listing ? canReadEntries(listing, selected, identity) : notReady
    const project = profile ? projectForPath(profile, pane.path) : null
    const backupReason =
      selected.length === 0
        ? pickFirst
        : !project?.projectPath || !project.backupPath
          ? translate(
              'auto.components.serverFiles.actions.noProject',
              'Set a project folder and backup folder in this connection’s settings first'
            )
          : selected.every((entry) => isSameOrInsideRemotePath(entry.path, project.projectPath))
            ? null
            : translate(
                'auto.components.serverFiles.actions.outsideProject',
                'Only items inside {{value0}} can be backed up',
                {
                  value0: project.projectPath
                }
              )
    const across =
      !other?.listing || selected.length === 0
        ? pickFirst
        : canChangeFolder(other.listing, identity)
    const single = selected.length === 1 ? selected[0] : null
    const terminalCwd =
      single && (single.kind === 'directory' || single.targetIsDirectory) ? single.path : pane.path
    const paths = selected.map((entry) => entry.path)
    const upload =
      (kind: 'files' | 'folders' | 'folder', mode: 'items' | 'contents') => async () => {
        const picked = await window.api.serverFiles.pickLocal({ kind })
        if (picked.ok && picked.value.length > 0 && pane.path) {
          await uploadToServer(prompts, serverId, picked.value, pane.path, mode)
        }
      }
    const protectPath = single?.path ?? pane.path ?? ''
    const isProtectedRoot = profile?.protectedPaths.includes(protectPath) ?? false

    const actions: Record<PaneActionId, PaneAction> = {
      'upload-files': action(
        translate('auto.components.serverFiles.actions.uploadFiles', 'Upload files…'),
        Upload,
        change,
        () => void upload('files', 'items')()
      ),
      'upload-folders': action(
        translate('auto.components.serverFiles.actions.uploadFolders', 'Upload folders…'),
        FolderUp,
        change,
        () => void upload('folders', 'items')()
      ),
      'upload-contents': action(
        translate(
          'auto.components.serverFiles.actions.uploadContents',
          'Upload a folder’s contents… (e.g. publish)'
        ),
        FolderInput,
        change,
        () => void upload('folder', 'contents')()
      ),
      mkdir: action(
        translate('auto.components.serverFiles.actions.mkdir', 'New folder'),
        FolderPlus,
        change,
        () =>
          pane.path &&
          void createFolderOnServer(
            prompts,
            serverId,
            pane.path,
            listing?.entries.map((e) => e.name) ?? []
          )
      ),
      download: action(
        translate('auto.components.serverFiles.actions.download', 'Download'),
        Download,
        read,
        () => void downloadFromServer(prompts, serverId, paths)
      ),
      'download-to': action(
        translate('auto.components.serverFiles.actions.downloadTo', 'Download to…'),
        Download,
        read,
        async () => {
          const folder = await chooseDownloadFolder(serverId)
          if (folder) {
            await downloadFromServer(prompts, serverId, paths, folder)
          }
        }
      ),
      backup: action(
        translate('auto.components.serverFiles.actions.backup', 'Back up'),
        Archive,
        backupReason,
        () =>
          project &&
          void copyOnServer(prompts, {
            kind: 'backup',
            serverId,
            projectId: project.id,
            sources: paths
          })
      ),
      'copy-across': action(
        translate('auto.components.serverFiles.actions.copyAcross', 'Copy to the other pane'),
        CopyPlus,
        across,
        () =>
          other?.path &&
          void copyOnServer(prompts, {
            kind: 'copy',
            serverId,
            sources: paths,
            destinationDir: other.path
          })
      ),
      terminal: action(
        translate('auto.components.serverFiles.actions.terminal', 'Open terminal here'),
        SquareTerminal,
        terminalCwd ? null : notReady,
        () => terminalCwd && void openServerTerminal(serverId, terminalCwd)
      ),
      rename: action(
        translate('auto.components.serverFiles.actions.rename', 'Rename'),
        Pencil,
        selected.length > 1
          ? translate('auto.components.serverFiles.actions.renameOne', 'Rename one item at a time')
          : removal,
        () =>
          single &&
          void renameOnServer(prompts, serverId, single, listing?.entries.map((e) => e.name) ?? [])
      ),
      remove: action(
        translate('auto.components.serverFiles.actions.remove', 'Delete'),
        Trash2,
        removal,
        () => void removeFromServer(prompts, serverId, selected)
      ),
      'copy-path': action(
        translate('auto.components.serverFiles.actions.copyPath', 'Copy path'),
        Clipboard,
        protectPath ? null : notReady,
        () => void navigator.clipboard.writeText(paths.length > 0 ? paths.join('\n') : protectPath)
      ),
      protect: action(
        isProtectedRoot
          ? translate(
              'auto.components.serverFiles.actions.unprotect',
              'Remove from protected paths'
            )
          : translate('auto.components.serverFiles.actions.protect', 'Add to protected paths'),
        Shield,
        protectPath && profile ? null : notReady,
        () => profile && protectPath && void toggleProtectedPath(profile, protectPath)
      )
    }
    return { actions, selected, project }
  }, [workspace, index, session, profile, prompts, serverId])
}
