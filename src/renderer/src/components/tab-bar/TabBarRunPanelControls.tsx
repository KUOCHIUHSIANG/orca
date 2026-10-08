import { useState } from 'react'
import { Play, RotateCw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  rerunConfigurationInTab,
  restartRunTab,
  runConfigurationInNewTab,
  stopRunTab
} from '@/lib/run-configuration-in-new-tab'
import { useDetectedRunConfigurations } from './use-detected-run-configurations'
import { useRunConfigurationTabs } from './use-run-configuration-tabs'

function RunPanelIconButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Icon controls on the run panel's strip; they act only on the panel's selected run tab. */
export function TabBarRunPanelControls({
  worktreeId,
  groupId
}: {
  worktreeId: string
  groupId: string
}): React.JSX.Element | null {
  const { configs } = useDetectedRunConfigurations(worktreeId)
  const { runTabs, runningTabIds, activeTerminalTabId } = useRunConfigurationTabs(
    worktreeId,
    groupId
  )
  const [restarting, setRestarting] = useState(false)
  const activeRunTab = runTabs.find((tab) => tab.tabId === activeTerminalTabId)
  if (!activeRunTab) {
    return null
  }
  const { tabId, label } = activeRunTab
  const config = configs.find((candidate) => candidate.label === label) ?? null
  const running = runningTabIds.has(tabId)

  const start = (): void => {
    if (config && !rerunConfigurationInTab({ config, tabId, worktreeId })) {
      runConfigurationInNewTab({ config, worktreeId })
    }
  }
  const restart = (): void => {
    if (!config) {
      return
    }
    setRestarting(true)
    void restartRunTab({ config, tabId, worktreeId }).finally(() => setRestarting(false))
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <RunPanelIconButton
        label={`Run ${label}`}
        disabled={running || restarting || !config}
        onClick={start}
      >
        <Play className="size-3.5 text-status-success" fill="currentColor" strokeWidth={0} />
      </RunPanelIconButton>
      <RunPanelIconButton
        label={`Stop ${label}`}
        disabled={!running || restarting}
        onClick={() => stopRunTab(tabId)}
      >
        <Square className="size-3 text-destructive" fill="currentColor" strokeWidth={0} />
      </RunPanelIconButton>
      <RunPanelIconButton
        label={`Restart ${label}`}
        disabled={restarting || !config}
        onClick={restart}
      >
        <RotateCw className="size-3.5 text-muted-foreground" />
      </RunPanelIconButton>
    </div>
  )
}
