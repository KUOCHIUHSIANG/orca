import { useAppStore } from '@/store'
import { reconcileTabOrder } from '@/components/tab-bar/reconcile-order'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import {
  ensureRunPanelGroup,
  moveTabToRunPanel,
  restoreFocusedGroup
} from '@/lib/run-configuration-panel'
import type { RunConfiguration } from '../../../shared/run-configuration-types'

/** Opens the run in the bottom run panel, leaving Claude and terminal groups where they are. */
export function runConfigurationInNewTab({
  config,
  worktreeId
}: {
  config: RunConfiguration
  worktreeId: string
}): { tabId: string } | null {
  if (!config.command.trim()) {
    return null
  }

  const store = useAppStore.getState()
  const focusedGroupId = store.activeGroupIdByWorktree[worktreeId]
  const runGroupId = ensureRunPanelGroup(worktreeId)
  const tab = store.createTab(worktreeId, runGroupId, undefined, {
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
  restoreFocusedGroup(worktreeId, focusedGroupId)

  return { tabId: tab.id }
}

/** Types the command into an idle run tab's shell; false when the tab has no live PTY. */
export function rerunConfigurationInTab({
  config,
  tabId,
  worktreeId
}: {
  config: RunConfiguration
  tabId: string
  worktreeId: string
}): boolean {
  const state = useAppStore.getState()
  const ptyId = state.ptyIdsByTabId[tabId]?.[0]
  if (!ptyId || !config.command.trim()) {
    return false
  }
  const focusedGroupId = state.activeGroupIdByWorktree[worktreeId]
  moveTabToRunPanel(worktreeId, tabId)
  window.api.pty.write(ptyId, `${config.command}\r`, 'launch')
  activateTabAndFocusPane(tabId, null)
  restoreFocusedGroup(worktreeId, focusedGroupId)
  return true
}

export function stopRunTab(tabId: string): void {
  for (const ptyId of useAppStore.getState().ptyIdsByTabId[tabId] ?? []) {
    window.api.pty.write(ptyId, '\x03', 'driving')
  }
}

const RESTART_POLL_MS = 200
// Why: dotnet/npm dev servers can take seconds to exit after Ctrl+C.
const RESTART_TIMEOUT_MS = 10_000

/** Stops the tab's service, waits for the shell to go idle, then reruns; false if it never stopped. */
export async function restartRunTab({
  config,
  tabId,
  worktreeId
}: {
  config: RunConfiguration
  tabId: string
  worktreeId: string
}): Promise<boolean> {
  const ptyId = useAppStore.getState().ptyIdsByTabId[tabId]?.[0]
  if (!ptyId) {
    return false
  }
  stopRunTab(tabId)
  const deadline = Date.now() + RESTART_TIMEOUT_MS
  while (await window.api.pty.hasChildProcesses(ptyId)) {
    if (Date.now() > deadline) {
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, RESTART_POLL_MS))
  }
  return rerunConfigurationInTab({ config, tabId, worktreeId })
}
