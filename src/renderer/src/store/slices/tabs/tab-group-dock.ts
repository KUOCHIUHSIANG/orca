import type { Tab, TabGroup, TabGroupLayoutNode } from '../../../../../shared/tab-types'
import type { AppState } from '../../types'
import { removeGroupLayoutLeaf } from '../../../../../shared/workspace-layout/tab-group-layout-tree'

// Why: web/mobile clients render the docked group as a normal split, so keep it short there.
const CENTER_ABOVE_DOCK_RATIO = 0.7

export function isDockedGroup(group: TabGroup | undefined): boolean {
  return group?.dock === 'bottom'
}

export function findDockedGroupId(groups: readonly TabGroup[]): string | null {
  return groups.find(isDockedGroup)?.id ?? null
}

/** The split layout without docked groups; null when only docked groups remain. */
export function withoutDockedGroups(
  layout: TabGroupLayoutNode | undefined,
  groups: readonly TabGroup[]
): TabGroupLayoutNode | null {
  let next = layout ?? null
  for (const group of groups) {
    if (next && isDockedGroup(group)) {
      next = removeGroupLayoutLeaf(next, group.id)
    }
  }
  return next
}

/** The focused split-layout group, else the one whose active tab was used most recently. */
export function pickCenterGroupId(
  groups: readonly TabGroup[],
  tabs: readonly Tab[],
  activeGroupId: string | undefined
): string | null {
  const centerGroups = groups.filter((group) => !isDockedGroup(group))
  if (centerGroups.some((group) => group.id === activeGroupId)) {
    return activeGroupId ?? null
  }
  const lastFocusedAt = (group: TabGroup): number =>
    tabs.find((tab) => tab.id === group.activeTabId)?.lastFocusedAt ?? 0
  let best: TabGroup | null = null
  for (const group of centerGroups) {
    if (!best || lastFocusedAt(group) > lastFocusedAt(best)) {
      best = group
    }
  }
  return best?.id ?? null
}

/** A split-layout group for content that must stay out of the bottom panel; adds one if none is left. */
export function ensureCenterGroupId(get: () => AppState, worktreeId: string): string {
  const state = get()
  const groups = state.groupsByWorktree[worktreeId] ?? []
  const existing = pickCenterGroupId(
    groups,
    state.unifiedTabsByWorktree[worktreeId] ?? [],
    state.activeGroupIdByWorktree[worktreeId]
  )
  if (existing) {
    return existing
  }
  const dockedGroupId = findDockedGroupId(groups)
  if (!dockedGroupId) {
    return state.ensureWorktreeRootGroup(worktreeId)
  }
  return (
    state.createEmptySplitGroup(worktreeId, dockedGroupId, 'up', {
      activate: false,
      wholeLayout: true,
      ratio: CENTER_ABOVE_DOCK_RATIO
    }) ?? dockedGroupId
  )
}

/** Whether a new tab aimed at `groupId` (or the focused group) would land in the bottom panel. */
export function targetsDockedGroup(
  state: AppState,
  worktreeId: string,
  groupId: string | undefined
): boolean {
  const target = groupId ?? state.activeGroupIdByWorktree[worktreeId]
  return isDockedGroup(state.groupsByWorktree[worktreeId]?.find((group) => group.id === target))
}
