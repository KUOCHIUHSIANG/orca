import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { listRunTabs, type RunTab } from '@/lib/run-configuration-tabs'

const POLL_INTERVAL_MS = 2000
const EMPTY_TAB_IDS: ReadonlySet<string> = new Set()

function sameTabIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id))
}

/** Run-launched tabs of a worktree plus which are running, rebuilt from persisted tab state. */
export function useRunConfigurationTabs(
  worktreeId: string,
  groupId: string
): {
  runTabs: RunTab[]
  runningTabIds: ReadonlySet<string>
  activeTerminalTabId: string | null
} {
  const terminalTabs = useAppStore((s) => s.tabsByWorktree[worktreeId])
  const activeTerminalTabId = useAppStore((s) => {
    const group = s.groupsByWorktree[worktreeId]?.find((g) => g.id === groupId)
    const tab = group?.activeTabId
      ? s.unifiedTabsByWorktree[worktreeId]?.find((t) => t.id === group.activeTabId)
      : undefined
    return tab?.contentType === 'terminal' ? tab.entityId : null
  })
  const ptyIdsByTabId = useAppStore((s) => s.ptyIdsByTabId)
  const ptyIdsByTabIdRef = useRef(ptyIdsByTabId)
  ptyIdsByTabIdRef.current = ptyIdsByTabId

  const runTabs = useMemo(() => listRunTabs(terminalTabs ?? []), [terminalTabs])
  // Why: title updates replace the tab array; restart polling only when the tab set changes.
  const runTabIdsKey = runTabs.map((t) => t.tabId).join('\n')
  const [runningTabIds, setRunningTabIds] = useState<ReadonlySet<string>>(EMPTY_TAB_IDS)

  useEffect(() => {
    const tabIds = runTabIdsKey ? runTabIdsKey.split('\n') : []
    if (tabIds.length === 0) {
      setRunningTabIds(EMPTY_TAB_IDS)
      return
    }

    let cancelled = false
    const check = async (): Promise<void> => {
      const running = new Set<string>()
      await Promise.all(
        tabIds.map(async (tabId) => {
          const ptyId = ptyIdsByTabIdRef.current[tabId]?.[0]
          if (!ptyId) {
            return
          }
          try {
            if (await window.api.pty.hasChildProcesses(ptyId)) {
              running.add(tabId)
            }
          } catch {
            // pty gone
          }
        })
      )
      if (!cancelled) {
        setRunningTabIds((prev) => (sameTabIds(prev, running) ? prev : running))
      }
    }

    const id = setInterval(() => void check(), POLL_INTERVAL_MS)
    void check()
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [runTabIdsKey])

  return { runTabs, runningTabIds, activeTerminalTabId }
}
