import { useAppStore } from '@/store'
import type {
  MainWindowCall,
  MainWindowCallRequest,
  MainWindowCallResult
} from '../../../../shared/detached-pages'

type AnyResult = MainWindowCallResult[MainWindowCall['action']]

async function runMainWindowCall(call: MainWindowCall): Promise<AnyResult> {
  switch (call.action) {
    case 'workspaceGroups': {
      const { openWorkspaceGroups } =
        await import('../monday-calendar/monday-claude-workspace-groups')
      return openWorkspaceGroups(useAppStore.getState())
    }
    case 'openPromptInClaude': {
      const { openMondayPromptInClaude } = await import('../monday-calendar/monday-claude-launch')
      await openMondayPromptInClaude(call.workspaceId, call.prompt)
      return null
    }
    case 'openServerTerminal': {
      const [{ openServerTerminal }, { loadServerProfiles }, { useServerFilesStore }] =
        await Promise.all([
          import('../server-files/server-files-terminal'),
          import('../server-files/server-files-navigation'),
          import('../server-files/server-files-store')
        ])
      // Why: the tab title uses the server's name, and this window may never have listed them.
      if (!useServerFilesStore.getState().profiles) {
        await loadServerProfiles()
      }
      return openServerTerminal(call.serverId, call.cwd, call.prefill)
    }
    case 'serverTerminalTabs': {
      const { serverTerminalTabs } = await import('../server-files/server-files-terminal')
      return serverTerminalTabs(call.serverId)
    }
    case 'typeIntoServerTerminal': {
      const { typeIntoServerTerminal } = await import('../server-files/server-files-terminal')
      return typeIntoServerTerminal(call.tabId, call.text)
    }
  }
}

/** Main window: does what a detached window asked and sends back the answer. */
export async function answerMainWindowCall(request: MainWindowCallRequest): Promise<void> {
  const api = window.api.detachedPages
  try {
    const value = await runMainWindowCall(request.call)
    api.replyMainWindowCall({ requestId: request.requestId, ok: true, value })
  } catch (error) {
    api.replyMainWindowCall({
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
