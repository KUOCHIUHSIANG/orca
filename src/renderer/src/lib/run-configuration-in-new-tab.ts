import { useAppStore } from '@/store'
import { reconcileTabOrder } from '@/components/tab-bar/reconcile-order'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import type { RunConfiguration } from '../../../shared/run-configuration-types'

export function runConfigurationInNewTab({
  config,
  worktreeId,
  groupId
}: {
  config: RunConfiguration
  worktreeId: string
  groupId?: string
}): { tabId: string } | null {
  if (!config.command.trim()) {
    return null
  }

  const store = useAppStore.getState()
  const tab = store.createTab(worktreeId, groupId, undefined, {
    quickCommandLabel: config.label
  })

  store.queueTabStartupCommand(tab.id, {
    command: config.command
  })

  store.setActiveTabType('terminal', worktreeId)

  const fresh = useAppStore.getState()
  const termIds = (fresh.tabsByWorktree[worktreeId] ?? []).map((t) => t.id)
  const editorIds = fresh.openFiles.filter((f) => f.worktreeId === worktreeId).map((f) => f.id)
  const browserIds = (fresh.browserTabsByWorktree?.[worktreeId] ?? []).map((t) => t.id)
  const base = reconcileTabOrder(
    fresh.tabBarOrderByWorktree[worktreeId],
    termIds,
    editorIds,
    browserIds
  )
  const order = base.filter((id) => id !== tab.id)
  order.push(tab.id)
  fresh.setTabBarOrder(worktreeId, order)

  return { tabId: tab.id }
}

/** Types the command into an idle run tab's shell; false when the tab has no live PTY. */
export function rerunConfigurationInTab({
  config,
  tabId
}: {
  config: RunConfiguration
  tabId: string
}): boolean {
  const ptyId = useAppStore.getState().ptyIdsByTabId[tabId]?.[0]
  if (!ptyId || !config.command.trim()) {
    return false
  }
  window.api.pty.write(ptyId, `${config.command}\r`, 'launch')
  activateTabAndFocusPane(tabId, null)
  return true
}

export function stopRunTab(tabId: string): void {
  for (const ptyId of useAppStore.getState().ptyIdsByTabId[tabId] ?? []) {
    window.api.pty.write(ptyId, '\x03', 'driving')
  }
}
