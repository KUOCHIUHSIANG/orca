import { toast } from 'sonner'
import { isSameOrInsideRemotePath, remoteParentPath } from '../../../../shared/server-files-paths'
import type { ServerProfile, ServerProject } from '../../../../shared/server-files-types'
import { errorSummary } from './server-files-messages'
import {
  emptyWorkspace,
  profileById,
  useServerFilesStore,
  type PaneIndex
} from './server-files-store'

export async function loadServerProfiles(): Promise<void> {
  const result = await window.api.serverFiles.listProfiles()
  const store = useServerFilesStore.getState()
  if (result.ok) {
    store.setProfiles(result.value)
    if (store.selectedServerId && !result.value.some((p) => p.id === store.selectedServerId)) {
      store.selectServer(null)
    }
  } else {
    store.setProfiles(store.profiles ?? [], result.error)
  }
}

/** The project whose folder holds `path`, the deepest one if they nest. */
export function projectForPath(profile: ServerProfile, path: string | null): ServerProject | null {
  if (!path) {
    return profile.projects.length === 1 ? profile.projects[0] : null
  }
  const matches = profile.projects.filter(
    (project) => project.projectPath && isSameOrInsideRemotePath(path, project.projectPath)
  )
  return matches.sort((a, b) => b.projectPath.length - a.projectPath.length)[0] ?? null
}

export async function navigatePane(
  serverId: string,
  index: PaneIndex,
  path: string,
  options: { highlight?: string[] } = {}
): Promise<void> {
  const store = useServerFilesStore.getState()
  const pane = (store.workspaces[serverId] ?? emptyWorkspace()).panes[index]
  store.updatePane(serverId, index, { loading: true })
  const result = await window.api.serverFiles.list({ serverId, path })
  const latest = useServerFilesStore.getState().workspaces[serverId]?.panes[index]
  if (!result.ok) {
    useServerFilesStore.getState().updatePane(serverId, index, {
      loading: false,
      // A failed move keeps the folder already shown; only a first load shows the error in place.
      error: latest?.listing ? null : result.error
    })
    if (latest?.listing) {
      toast.error(errorSummary({ ...result.error, path: result.error.path ?? path }))
    }
    return
  }
  const samePath = pane.path === result.value.path
  useServerFilesStore.getState().updatePane(serverId, index, {
    path: result.value.path,
    listing: result.value,
    loading: false,
    error: null,
    selected: samePath
      ? (latest?.selected ?? []).filter((selected) =>
          result.value.entries.some((entry) => entry.path === selected)
        )
      : [],
    anchor: samePath ? (latest?.anchor ?? null) : null,
    highlighted: options.highlight ?? (samePath ? (latest?.highlighted ?? []) : [])
  })
}

/** Re-lists every pane showing one of `folders` (or all panes when none are given). */
export async function refreshPanes(serverId: string, folders?: readonly string[]): Promise<void> {
  const workspace = useServerFilesStore.getState().workspaces[serverId]
  if (!workspace) {
    return
  }
  await Promise.all(
    workspace.panes.map(async (pane, index) => {
      if (!pane.path) {
        return
      }
      const shows =
        !folders ||
        folders.some((folder) => folder === pane.path || remoteParentPath(folder) === pane.path)
      if (shows) {
        await navigatePane(serverId, index === 0 ? 0 : 1, pane.path)
      }
    })
  )
}

export async function connectServer(serverId: string): Promise<void> {
  const store = useServerFilesStore.getState()
  store.setSession(serverId, { status: 'connecting' })
  const result = await window.api.serverFiles.connect({ serverId })
  if (!result.ok) {
    useServerFilesStore.getState().setSession(serverId, { status: 'error', error: result.error })
    return
  }
  useServerFilesStore.getState().setSession(serverId, { status: 'connected', info: result.value })
  const workspace = useServerFilesStore.getState().workspaces[serverId] ?? emptyWorkspace()
  const profile = profileById(serverId)
  const start = profile?.startPath || result.value.homePath
  await navigatePane(serverId, 0, workspace.panes[0].path ?? start)
  if (workspace.split) {
    await navigatePane(serverId, 1, workspace.panes[1].path ?? secondPaneStart(serverId))
  }
}

/** The second pane opens on the current project's backup folder, the usual partner. */
export function secondPaneStart(serverId: string): string {
  const state = useServerFilesStore.getState()
  const profile = profileById(serverId)
  const session = state.sessions[serverId]
  const home = session?.status === 'connected' ? session.info.homePath : '/'
  const first = state.workspaces[serverId]?.panes[0].path ?? null
  const project = profile ? projectForPath(profile, first) : null
  return project?.backupPath || home
}

export async function setSplitView(serverId: string, split: boolean): Promise<void> {
  const store = useServerFilesStore.getState()
  store.updateWorkspace(serverId, {
    split,
    activePane: split ? (store.workspaces[serverId]?.activePane ?? 0) : 0
  })
  const pane = useServerFilesStore.getState().workspaces[serverId]?.panes[1]
  if (split && !pane?.listing) {
    await navigatePane(serverId, 1, pane?.path ?? secondPaneStart(serverId))
  }
}

export async function disconnectServer(serverId: string): Promise<void> {
  await window.api.serverFiles.disconnect({ serverId })
  useServerFilesStore.getState().setSession(serverId, null)
}
