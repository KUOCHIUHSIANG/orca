import { create } from 'zustand'

// Why localStorage: a per-device layout preference, like the panel's own open/height state.
const STORAGE_KEY = 'orca.bottomPanel.git'

export type GitToolWindowLayout = {
  commitPaneWidth: number
  detailsWidth: number
  /** Height of the commit message + buttons block under the changes list. */
  commitBoxHeight: number
  /** Height of the commit message/author block under the changed-files list. */
  commitInfoHeight: number
}

export const GIT_TOOL_WINDOW_LAYOUT_LIMITS = {
  commitPaneWidth: { min: 200, fallback: 288 },
  detailsWidth: { min: 220, fallback: 320 },
  commitBoxHeight: { min: 96, fallback: 120 },
  commitInfoHeight: { min: 56, fallback: 132 }
} satisfies Record<keyof GitToolWindowLayout, { min: number; fallback: number }>

type GitToolWindowState = {
  commitPaneOpen: boolean
  layout: GitToolWindowLayout
  /** Per-worktree commit message drafts; session-only. */
  commitDrafts: Record<string, string>
  /** Per-worktree log ref; absent means the current branch plus its upstream. */
  logRefByWorktree: Record<string, string>
  selectedCommitByWorktree: Record<string, string>
  /** Commit the log should scroll to once it has loaded, requested from outside this tab. */
  pendingRevealByWorktree: Record<string, string>
  toggleCommitPane: () => void
  setLayoutSize: (key: keyof GitToolWindowLayout, size: number) => void
  setCommitDraft: (worktreeId: string, message: string) => void
  setLogRef: (worktreeId: string, ref: string | null) => void
  setSelectedCommit: (worktreeId: string, commitId: string | null) => void
  revealCommit: (worktreeId: string, commitId: string) => void
  clearPendingReveal: (worktreeId: string) => void
}

type PersistedGitToolWindow = Pick<GitToolWindowState, 'commitPaneOpen' | 'layout'>

function readSize(savedLayout: unknown, key: keyof GitToolWindowLayout): number {
  const { min, fallback } = GIT_TOOL_WINDOW_LAYOUT_LIMITS[key]
  const value: unknown =
    savedLayout && typeof savedLayout === 'object' && key in savedLayout
      ? Reflect.get(savedLayout, key)
      : undefined
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, value) : fallback
}

function readPersisted(): PersistedGitToolWindow {
  let parsed: unknown = null
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage?.getItem(STORAGE_KEY)
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }
  const record = parsed && typeof parsed === 'object' ? parsed : {}
  const savedLayout: unknown = 'layout' in record ? record.layout : null
  return {
    commitPaneOpen: 'commitPaneOpen' in record ? record.commitPaneOpen !== false : true,
    layout: {
      commitPaneWidth: readSize(savedLayout, 'commitPaneWidth'),
      detailsWidth: readSize(savedLayout, 'detailsWidth'),
      commitBoxHeight: readSize(savedLayout, 'commitBoxHeight'),
      commitInfoHeight: readSize(savedLayout, 'commitInfoHeight')
    }
  }
}

function withEntry(
  record: Record<string, string>,
  key: string,
  value: string | null
): Record<string, string> {
  if (value === null) {
    if (!(key in record)) {
      return record
    }
    const next = { ...record }
    delete next[key]
    return next
  }
  return record[key] === value ? record : { ...record, [key]: value }
}

export const useGitToolWindowState = create<GitToolWindowState>((set) => ({
  ...readPersisted(),
  commitDrafts: {},
  logRefByWorktree: {},
  selectedCommitByWorktree: {},
  pendingRevealByWorktree: {},
  toggleCommitPane: () => set((state) => ({ commitPaneOpen: !state.commitPaneOpen })),
  setLayoutSize: (key, size) =>
    set((state) => ({
      layout: {
        ...state.layout,
        [key]: Math.max(GIT_TOOL_WINDOW_LAYOUT_LIMITS[key].min, Math.round(size))
      }
    })),
  setCommitDraft: (worktreeId, message) =>
    set((state) => ({ commitDrafts: withEntry(state.commitDrafts, worktreeId, message || null) })),
  setLogRef: (worktreeId, ref) =>
    set((state) => ({
      logRefByWorktree: withEntry(state.logRefByWorktree, worktreeId, ref),
      selectedCommitByWorktree: withEntry(state.selectedCommitByWorktree, worktreeId, null)
    })),
  setSelectedCommit: (worktreeId, commitId) =>
    set((state) => ({
      selectedCommitByWorktree: withEntry(state.selectedCommitByWorktree, worktreeId, commitId)
    })),
  revealCommit: (worktreeId, commitId) =>
    set((state) => ({
      selectedCommitByWorktree: withEntry(state.selectedCommitByWorktree, worktreeId, commitId),
      pendingRevealByWorktree: withEntry(state.pendingRevealByWorktree, worktreeId, commitId)
    })),
  clearPendingReveal: (worktreeId) =>
    set((state) => ({
      pendingRevealByWorktree: withEntry(state.pendingRevealByWorktree, worktreeId, null)
    }))
}))

useGitToolWindowState.subscribe((state, previous) => {
  if (state.commitPaneOpen === previous.commitPaneOpen && state.layout === previous.layout) {
    return
  }
  try {
    window.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ commitPaneOpen: state.commitPaneOpen, layout: state.layout })
    )
  } catch {
    // Storage full or unavailable; the layout still works for this session.
  }
})
