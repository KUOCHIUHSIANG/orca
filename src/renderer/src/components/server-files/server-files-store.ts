import { create } from 'zustand'
import type {
  RemoteDirectoryState,
  ServerFilesError,
  ServerProfile,
  ServerProfileSummary,
  ServerSessionInfo
} from '../../../../shared/server-files-types'

export type ServerSessionState =
  | { status: 'connecting' }
  | { status: 'connected'; info: ServerSessionInfo }
  | { status: 'error'; error: ServerFilesError }

export type PaneState = {
  path: string | null
  listing: RemoteDirectoryState | null
  loading: boolean
  error: ServerFilesError | null
  /** Selected entry paths. */
  selected: string[]
  anchor: string | null
  /** Entries to point out after an action, e.g. what a backup just wrote. */
  highlighted: string[]
}

export type PaneIndex = 0 | 1

export type ServerWorkspaceState = {
  panes: [PaneState, PaneState]
  split: boolean
  activePane: PaneIndex
}

const EMPTY_PANE: PaneState = {
  path: null,
  listing: null,
  loading: false,
  error: null,
  selected: [],
  anchor: null,
  highlighted: []
}

const EMPTY_WORKSPACE: ServerWorkspaceState = {
  panes: [EMPTY_PANE, EMPTY_PANE],
  split: false,
  activePane: 0
}

/** Shared, so selectors that fall back to it keep a stable reference. */
export function emptyWorkspace(): ServerWorkspaceState {
  return EMPTY_WORKSPACE
}

export function toProfile(summary: ServerProfileSummary): ServerProfile {
  return {
    id: summary.id,
    label: summary.label,
    endpoint: summary.endpoint,
    auth: summary.auth,
    identityFile: summary.identityFile,
    startPath: summary.startPath,
    downloadDir: summary.downloadDir,
    protectedPaths: summary.protectedPaths,
    projects: summary.projects,
    commandTemplates: summary.commandTemplates
  }
}

type ServerFilesState = {
  profiles: ServerProfileSummary[] | null
  loadError: ServerFilesError | null
  selectedServerId: string | null
  sessions: Record<string, ServerSessionState>
  workspaces: Record<string, ServerWorkspaceState>
  /** Terminal tab id → the server it was opened for. */
  terminalTabs: Record<string, string>
  setProfiles: (profiles: ServerProfileSummary[] | null, error?: ServerFilesError | null) => void
  selectServer: (serverId: string | null) => void
  setSession: (serverId: string, session: ServerSessionState | null) => void
  updatePane: (serverId: string, index: PaneIndex, patch: Partial<PaneState>) => void
  updateWorkspace: (serverId: string, patch: Partial<Omit<ServerWorkspaceState, 'panes'>>) => void
  registerTerminalTab: (tabId: string, serverId: string) => void
}

export const useServerFilesStore = create<ServerFilesState>((set) => ({
  profiles: null,
  loadError: null,
  selectedServerId: null,
  sessions: {},
  workspaces: {},
  terminalTabs: {},
  setProfiles: (profiles, error = null) => set({ profiles, loadError: error }),
  selectServer: (serverId) => set({ selectedServerId: serverId }),
  setSession: (serverId, session) =>
    set((state) => {
      const sessions = { ...state.sessions }
      if (session) {
        sessions[serverId] = session
      } else {
        delete sessions[serverId]
      }
      return { sessions }
    }),
  updatePane: (serverId, index, patch) =>
    set((state) => {
      const workspace = state.workspaces[serverId] ?? emptyWorkspace()
      const panes: [PaneState, PaneState] = [...workspace.panes]
      panes[index] = { ...panes[index], ...patch }
      return { workspaces: { ...state.workspaces, [serverId]: { ...workspace, panes } } }
    }),
  updateWorkspace: (serverId, patch) =>
    set((state) => ({
      workspaces: {
        ...state.workspaces,
        [serverId]: { ...(state.workspaces[serverId] ?? emptyWorkspace()), ...patch }
      }
    })),
  registerTerminalTab: (tabId, serverId) =>
    set((state) => ({ terminalTabs: { ...state.terminalTabs, [tabId]: serverId } }))
}))

export function profileById(serverId: string | null): ServerProfileSummary | null {
  if (!serverId) {
    return null
  }
  return useServerFilesStore.getState().profiles?.find((profile) => profile.id === serverId) ?? null
}

export function sessionInfo(serverId: string): ServerSessionInfo | null {
  const session = useServerFilesStore.getState().sessions[serverId]
  return session?.status === 'connected' ? session.info : null
}

/** Labels for the SSH credential prompt, whose targets are `server-files-<id>`. */
export function serverFilesCredentialLabel(targetId: string): string | null {
  const prefix = 'server-files-'
  return targetId.startsWith(prefix)
    ? (profileById(targetId.slice(prefix.length))?.label ?? null)
    : null
}
