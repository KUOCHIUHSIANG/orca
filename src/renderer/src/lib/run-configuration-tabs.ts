import type { RunConfiguration } from '../../../shared/run-configuration-types'

/** A terminal tab launched by Run; its persisted label survives remounts and restarts. */
export type RunTab = { tabId: string; label: string; createdAt: number }

export type PrimaryRunTarget = {
  label: string
  command: string | null
  running: boolean
  config: RunConfiguration | null
  /** Tab the primary action stops or reruns in; null opens or reuses one by config. */
  tabId: string | null
}

export function listRunTabs(
  terminalTabs: readonly { id: string; quickCommandLabel?: string | null; createdAt: number }[]
): RunTab[] {
  const runTabs: RunTab[] = []
  for (const tab of terminalTabs) {
    const label = tab.quickCommandLabel?.trim()
    if (label) {
      runTabs.push({ tabId: tab.id, label, createdAt: tab.createdAt })
    }
  }
  return runTabs
}

export function findRunningTabIds(
  runTabs: readonly RunTab[],
  label: string,
  runningTabIds: ReadonlySet<string>
): string[] {
  return runTabs.filter((t) => t.label === label && runningTabIds.has(t.tabId)).map((t) => t.tabId)
}

/** Newest idle tab that last ran `label`, so a rerun doesn't pile up tabs. */
export function findReusableRunTab(
  runTabs: readonly RunTab[],
  label: string,
  runningTabIds: ReadonlySet<string>
): RunTab | null {
  let best: RunTab | null = null
  for (const tab of runTabs) {
    if (tab.label !== label || runningTabIds.has(tab.tabId)) {
      continue
    }
    if (!best || tab.createdAt > best.createdAt) {
      best = tab
    }
  }
  return best
}

export function resolvePrimaryRunTarget({
  configs,
  runTabs,
  runningTabIds,
  activeTerminalTabId,
  recentConfigId
}: {
  configs: readonly RunConfiguration[]
  runTabs: readonly RunTab[]
  runningTabIds: ReadonlySet<string>
  activeTerminalTabId: string | null
  recentConfigId: string | null
}): PrimaryRunTarget | null {
  const activeRunTab = runTabs.find((t) => t.tabId === activeTerminalTabId)
  if (activeRunTab) {
    const config = configs.find((c) => c.label === activeRunTab.label) ?? null
    const running = runningTabIds.has(activeRunTab.tabId)
    // An idle tab whose config vanished has nothing to rerun; fall back to the default.
    if (running || config) {
      return {
        label: activeRunTab.label,
        command: config?.command ?? null,
        running,
        config,
        tabId: activeRunTab.tabId
      }
    }
  }

  // Why: recentConfigId is lost on remount; the newest run tab remembers the last pick.
  const newestRunTab = runTabs.reduce<RunTab | null>(
    (newest, tab) => (!newest || tab.createdAt > newest.createdAt ? tab : newest),
    null
  )
  const config =
    (recentConfigId ? configs.find((c) => c.id === recentConfigId) : undefined) ??
    (newestRunTab ? configs.find((c) => c.label === newestRunTab.label) : undefined) ??
    configs[0]
  if (!config) {
    return null
  }
  return {
    label: config.label,
    command: config.command,
    running: findRunningTabIds(runTabs, config.label, runningTabIds).length > 0,
    config,
    tabId: null
  }
}
