import { useAppStore } from '@/store'
import { useBottomPanelState } from '@/lib/bottom-panel-state'
import { findDockedGroupId } from '@/store/slices/tabs/tab-group-dock'
import type { TabGroupLayoutNode } from '../../../shared/tab-types'

// Why: web/mobile clients render the docked group as a normal split; keep it a bottom third there.
const RUN_PANEL_FIRST_CHILD_RATIO = 0.7

/** The group in the window's top-right corner, which hosts the pinned Run widget. */
export function findTopRightGroupId(layout: TabGroupLayoutNode): string {
  if (layout.type === 'leaf') {
    return layout.groupId
  }
  return findTopRightGroupId(layout.direction === 'vertical' ? layout.first : layout.second)
}

/** Returns the worktree's bottom-panel group, creating it if needed, and opens the panel. */
export function ensureRunPanelGroup(worktreeId: string): string {
  useBottomPanelState.getState().setOpen(true)
  const state = useAppStore.getState()
  const existing = findDockedGroupId(state.groupsByWorktree[worktreeId] ?? [])
  if (existing) {
    return existing
  }
  const rootGroupId = state.ensureWorktreeRootGroup(worktreeId)
  return (
    state.createEmptySplitGroup(worktreeId, rootGroupId, 'down', {
      activate: false,
      wholeLayout: true,
      ratio: RUN_PANEL_FIRST_CHILD_RATIO,
      dock: 'bottom'
    }) ?? rootGroupId
  )
}

/** Moves a reused run tab that predates the bottom panel back into it. */
export function moveTabToRunPanel(worktreeId: string, terminalTabId: string): void {
  const tab = useAppStore
    .getState()
    .unifiedTabsByWorktree[worktreeId]?.find(
      (candidate) => candidate.contentType === 'terminal' && candidate.entityId === terminalTabId
    )
  if (!tab) {
    return
  }
  const runGroupId = ensureRunPanelGroup(worktreeId)
  if (tab.groupId !== runGroupId) {
    useAppStore
      .getState()
      .moveUnifiedTabToGroup(tab.id, runGroupId, { activate: true, recordInteraction: false })
  }
}

/** Hands focus back to the group the user launched from, so its Run button stays put. */
export function restoreFocusedGroup(worktreeId: string, groupId: string | undefined): void {
  const state = useAppStore.getState()
  if (!groupId || state.activeGroupIdByWorktree[worktreeId] === groupId) {
    return
  }
  if (!(state.groupsByWorktree[worktreeId] ?? []).some((group) => group.id === groupId)) {
    return
  }
  state.focusGroup(worktreeId, groupId)
}
