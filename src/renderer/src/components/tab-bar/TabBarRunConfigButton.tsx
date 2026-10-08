import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, Play, Square, TerminalSquare } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { RunConfiguration } from '../../../../shared/run-configuration-types'
import {
  rerunConfigurationInTab,
  runConfigurationInNewTab,
  stopRunTab
} from '@/lib/run-configuration-in-new-tab'
import {
  findReusableRunTab,
  findRunningTabIds,
  resolvePrimaryRunTarget
} from '@/lib/run-configuration-tabs'
import {
  RunConfigSectionHeader,
  TabBarRunConfigMenuEntries,
  TabBarRunConfigRunningSection
} from './TabBarRunConfigMenuEntries'
import { useRunConfigurationTabs } from './use-run-configuration-tabs'
import { useDetectedRunConfigurations } from './use-detected-run-configurations'

type TabBarRunConfigButtonProps = {
  worktreeId: string
  groupId: string
}

function DotnetIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}

export function TabBarRunConfigButton({
  worktreeId,
  groupId
}: TabBarRunConfigButtonProps): React.JSX.Element | null {
  const [menuOpen, setMenuOpen] = useState(false)
  const [recentConfigId, setRecentConfigId] = useState<string | null>(null)
  const {
    repoId,
    configs,
    loading,
    refresh: runDetection
  } = useDetectedRunConfigurations(worktreeId)
  const { runTabs, runningTabIds, activeTerminalTabId } = useRunConfigurationTabs(
    worktreeId,
    groupId
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setMenuOpen(next)
      if (next) {
        void runDetection()
      }
    },
    [runDetection]
  )

  const dotnetConfigs = useMemo(() => configs.filter((c) => c.type === 'dotnet'), [configs])
  const npmConfigs = useMemo(() => configs.filter((c) => c.type === 'npm'), [configs])

  const runningConfigIds = useMemo(() => {
    const runningLabels = new Set(
      runTabs.filter((t) => runningTabIds.has(t.tabId)).map((t) => t.label)
    )
    return new Set(configs.filter((c) => runningLabels.has(c.label)).map((c) => c.id))
  }, [configs, runTabs, runningTabIds])

  const primary = useMemo(
    () =>
      resolvePrimaryRunTarget({
        configs,
        runTabs,
        runningTabIds,
        activeTerminalTabId,
        recentConfigId
      }),
    [configs, runTabs, runningTabIds, activeTerminalTabId, recentConfigId]
  )

  const runConfig = useCallback(
    (config: RunConfiguration, preferredTabId: string | null = null) => {
      setRecentConfigId(config.id)
      const reuseTabId =
        preferredTabId ?? findReusableRunTab(runTabs, config.label, runningTabIds)?.tabId
      if (reuseTabId && rerunConfigurationInTab({ config, tabId: reuseTabId, worktreeId })) {
        return
      }
      runConfigurationInNewTab({ config, worktreeId })
    },
    [runTabs, runningTabIds, worktreeId]
  )

  const handleConfigAction = useCallback(
    (config: RunConfiguration) => {
      setMenuOpen(false)
      const runningIds = findRunningTabIds(runTabs, config.label, runningTabIds)
      if (runningIds.length > 0) {
        runningIds.forEach(stopRunTab)
        return
      }
      runConfig(config)
    },
    [runTabs, runningTabIds, runConfig]
  )

  const handlePrimaryClick = useCallback(() => {
    if (!primary) {
      return
    }
    if (primary.running) {
      const tabIds = primary.tabId
        ? [primary.tabId]
        : findRunningTabIds(runTabs, primary.label, runningTabIds)
      tabIds.forEach(stopRunTab)
    } else if (primary.config) {
      runConfig(primary.config, primary.tabId)
    }
  }, [primary, runTabs, runningTabIds, runConfig])

  if (!repoId) {
    return null
  }

  const hasConfigs = configs.length > 0

  const splitButtonClass =
    'my-auto flex h-7 shrink-0 items-stretch overflow-hidden rounded-md border border-border/60 text-muted-foreground'
  const innerButtonBase =
    'flex items-center bg-transparent leading-none text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  if (!hasConfigs && !loading) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => handleOpenChange(true)}
            className="my-auto flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Run configuration"
          >
            <Play className="size-3.5 text-status-success" />
            <span className="text-[12px] font-medium @max-[480px]/tab-strip:hidden">Run</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          No run configurations detected
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className={splitButtonClass}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handlePrimaryClick}
            disabled={!primary}
            className={cn(innerButtonBase, 'gap-1.5 rounded-l-md rounded-r-none px-1.5')}
            aria-label={
              primary
                ? `${primary.running ? 'Stop' : 'Run'}: ${primary.label}`
                : 'Run configuration'
            }
          >
            {primary?.running ? (
              <Square
                className="size-3 shrink-0 text-destructive"
                fill="currentColor"
                strokeWidth={0}
              />
            ) : (
              <Play
                className="size-3 shrink-0 text-status-success"
                fill="currentColor"
                strokeWidth={0}
              />
            )}
            {/* Why: every split strip mounts this now, so narrow strips go icon-only by width. */}
            <span className="max-w-[160px] truncate text-[12px] font-medium @max-[480px]/tab-strip:hidden">
              {primary?.label ?? 'Run'}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {primary
            ? `${primary.running ? 'Stop' : 'Run'}: ${primary.command ?? primary.label}`
            : 'Run configuration'}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu modal={false} open={menuOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              innerButtonBase,
              'justify-center rounded-l-none rounded-r-md border-l border-border/60 px-1'
            )}
            aria-label="More run configurations"
          >
            <ChevronDown className="size-3" strokeWidth={2.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-80">
          <div className="max-h-80 overflow-y-auto scrollbar-sleek">
            <TabBarRunConfigRunningSection
              runTabs={runTabs}
              runningTabIds={runningTabIds}
              onStop={stopRunTab}
            />
            {loading && configs.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                Detecting configurations...
              </div>
            ) : null}
            {dotnetConfigs.length > 0 ? (
              <>
                <RunConfigSectionHeader
                  icon={<DotnetIcon className="size-3" />}
                  label=".NET Projects"
                />
                <TabBarRunConfigMenuEntries
                  configs={dotnetConfigs}
                  Icon={DotnetIcon}
                  runningSet={runningConfigIds}
                  onSelect={handleConfigAction}
                />
              </>
            ) : null}
            {dotnetConfigs.length > 0 && npmConfigs.length > 0 ? <DropdownMenuSeparator /> : null}
            {npmConfigs.length > 0 ? (
              <>
                <RunConfigSectionHeader
                  icon={<TerminalSquare className="size-3" />}
                  label="npm Scripts"
                />
                <TabBarRunConfigMenuEntries
                  configs={npmConfigs}
                  Icon={TerminalSquare}
                  runningSet={runningConfigIds}
                  onSelect={handleConfigAction}
                />
              </>
            ) : null}
            {!loading && configs.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                No configurations detected
              </div>
            ) : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
