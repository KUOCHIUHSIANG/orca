import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { ensureDetectedAgentsForWorktree } from '@/lib/agent-detection-target-inventory'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { describeClipboardWriteFailure } from '@/lib/clipboard-write-failure'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'

export async function copyMondayPrompt(prompt: string): Promise<boolean> {
  try {
    await window.api.ui.writeClipboardText(prompt)
    return true
  } catch (error) {
    toast.error(
      translate('auto.components.mondayCalendar.claude.copyFailed', 'Could not copy the prompt.'),
      { description: describeClipboardWriteFailure(error) }
    )
    return false
  }
}

/** Switches to the workspace and opens a new Claude tab with the prompt typed in but not sent. */
export async function openMondayPromptInClaude(workspaceId: string, prompt: string): Promise<void> {
  await copyMondayPrompt(prompt)
  const detectedAgents = await ensureDetectedAgentsForWorktree(useAppStore.getState(), workspaceId)
  const disabledAgents = useAppStore.getState().settings?.disabledTuiAgents
  if (!detectedAgents.includes('claude') || !isTuiAgentEnabled('claude', disabledAgents)) {
    toast.error(
      translate(
        'auto.components.mondayCalendar.claude.unavailable',
        'Claude is not available on this project’s host.'
      )
    )
    return
  }
  let revealFailed = false
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    agent: 'claude',
    worktreeId: workspaceId,
    prompt,
    promptDelivery: 'draft',
    launchSource: 'task_page',
    beforeSurfaceOpen: () => {
      // Why: the launcher owns the initial surface, so revealing must not seed a sibling shell.
      revealFailed =
        activateAndRevealWorkspace(workspaceId, { providesInitialSurface: true }) === false
      return !revealFailed
    }
  })
  if (!result) {
    // Why: a folder that cannot be revealed already explains why in its own toast.
    if (!revealFailed) {
      toast.error(
        translate(
          'auto.components.mondayCalendar.claude.launchFailed',
          'Could not open Claude in this project.'
        )
      )
    }
    return
  }
  if (result.surface.kind === 'local-terminal') {
    focusTerminalTabSurface(result.surface.tabId)
  }
}
