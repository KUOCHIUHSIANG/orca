import { useAppStore } from '@/store'
import { findTopRightGroupId } from '@/lib/run-configuration-panel'
import { isDockedGroup, withoutDockedGroups } from '@/store/slices/tabs/tab-group-dock'
import type { TabGroup } from '../../../../shared/tab-types'
import { TabBarRunConfigButton } from './TabBarRunConfigButton'
import { TabBarRunPanelControls } from './TabBarRunPanelControls'

const EMPTY_GROUPS: readonly TabGroup[] = []

/** Pins the Run widget top-right and icon controls to the bottom panel, so neither follows focus. */
export function TabBarRunControls({
  worktreeId,
  groupId
}: {
  worktreeId: string
  groupId: string
}): React.JSX.Element | null {
  const isRunPanel = useAppStore((s) =>
    isDockedGroup(s.groupsByWorktree[worktreeId]?.find((group) => group.id === groupId))
  )
  const isWidgetHost = useAppStore((s) => {
    const centerLayout = withoutDockedGroups(
      s.layoutByWorktree[worktreeId],
      s.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS
    )
    // Why: with no split-layout group left, the bottom panel keeps the widget reachable.
    return centerLayout ? findTopRightGroupId(centerLayout) === groupId : isRunPanel
  })
  if (!isWidgetHost && !isRunPanel) {
    return null
  }
  return (
    <>
      {isRunPanel ? <TabBarRunPanelControls worktreeId={worktreeId} groupId={groupId} /> : null}
      {isWidgetHost ? <TabBarRunConfigButton worktreeId={worktreeId} groupId={groupId} /> : null}
    </>
  )
}
