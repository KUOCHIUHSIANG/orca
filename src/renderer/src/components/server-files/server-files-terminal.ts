import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { resolveStartupShell } from '../../../../shared/tui-agent-startup-shell'
import { errorSummary } from './server-files-messages'
import { profileById, useServerFilesStore } from './server-files-store'
import { createBrowserUuid } from '@/lib/browser-uuid'

function localShell(): 'posix' | 'powershell' {
  return resolveStartupShell(navigator.userAgent.includes('Windows') ? 'win32' : 'darwin') ===
    'powershell'
    ? 'powershell'
    : 'posix'
}

function showFloatingTab(tabId: string): void {
  const store = useAppStore.getState()
  store.setFloatingWorkspacePanelOpen(true)
  focusTerminalTabSurface(tabId)
}

/** A floating terminal tab running the system `ssh`, so nothing is installed on the server. */
export async function openServerTerminal(
  serverId: string,
  cwd: string,
  prefill?: { command: string }
): Promise<boolean> {
  const app = useAppStore.getState()
  if (!app.settings?.floatingTerminalEnabled) {
    toast.error(
      translate(
        'auto.components.serverFiles.terminal.floatingOff',
        'The floating terminal is turned off'
      ),
      {
        action: {
          label: translate('auto.components.serverFiles.terminal.turnOn', 'Turn on'),
          onClick: () => void app.updateSettings({ floatingTerminalEnabled: true })
        }
      }
    )
    return false
  }
  const result = await window.api.serverFiles.terminalCommand({
    serverId,
    cwd,
    localShell: localShell(),
    ...(prefill
      ? {
          prefill: {
            command: prefill.command,
            hint: translate(
              'auto.components.serverFiles.terminal.prefillHint',
              'Edit if needed, then press Enter to run. Ctrl+C cancels.'
            )
          }
        }
      : {})
  })
  if (!result.ok) {
    toast.error(errorSummary(result.error))
    return false
  }
  const label = profileById(serverId)?.label ?? ''
  const groupId = app.activeGroupIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID]
  const tab = app.createTab(FLOATING_TERMINAL_WORKTREE_ID, groupId, undefined, {
    id: createBrowserUuid(),
    quickCommandLabel: `${label}:${cwd}`,
    pendingStartup: { command: result.value }
  })
  useServerFilesStore.getState().registerTerminalTab(tab.id, serverId)
  showFloatingTab(tab.id)
  return true
}

export type ServerTerminalTab = { tabId: string; title: string }

/** Floating tabs this page opened for `serverId` that are still open. */
export function serverTerminalTabs(serverId: string): ServerTerminalTab[] {
  const mapping = useServerFilesStore.getState().terminalTabs
  const tabs = useAppStore.getState().tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []
  return tabs
    .filter((tab) => mapping[tab.id] === serverId)
    .map((tab) => ({ tabId: tab.id, title: tab.quickCommandLabel ?? tab.title ?? '' }))
}

/**
 * Types `text` at the tab's prompt without pressing Enter. Refuses unless `ssh` is still in the
 * foreground, so a command meant for the server can't land in a local shell after `exit`.
 */
export async function typeIntoServerTerminal(tabId: string, text: string): Promise<boolean> {
  const ptyId = useAppStore.getState().ptyIdsByTabId[tabId]?.[0]
  if (!ptyId) {
    return false
  }
  const foreground = await window.api.pty.getForegroundProcess(ptyId).catch(() => null)
  if (!foreground || !/(^|[\\/])ssh(\.exe)?$/i.test(foreground)) {
    return false
  }
  window.api.pty.write(ptyId, text.replace(/[\r\n]+/g, ' '), 'driving')
  showFloatingTab(tabId)
  return true
}
