import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, Play, Square } from 'lucide-react'
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
  partitionRunConfigurations,
  useRunConfigurationVisibility
} from '@/lib/run-configuration-visibility'
import { TabBarRunConfigRunningSection } from './TabBarRunConfigMenuEntries'
import { RunConfigHiddenSubmenu, RunConfigSections } from './TabBarRunConfigMenuSections'
import { useRunConfigurationTabs } from './use-run-configuration-tabs'
import { useDetectedRunConfigurations } from './use-detected-run-configurations'

type TabBarRunConfigButtonProps = {
  worktreeId: string
  groupId: string
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

  const visibilityOverrides = useRunConfigurationVisibility((s) =>
    repoId ? s.overridesByRepo[repoId] : undefined
  )
  const setConfigsHidden = useRunConfigurationVisibility((s) => s.setHidden)
  const { visible: visibleConfigs, hidden: hiddenConfigs } = useMemo(
    () => partitionRunConfigurations(configs, visibilityOverrides),
    [configs, visibilityOverrides]
  )
  // Why: visible first so the primary button's default prefers a shown config.
  const orderedConfigs = useMemo(
    () => [...visibleConfigs, ...hiddenConfigs],
    [visibleConfigs, hiddenConfigs]
  )

  const runningConfigIds = useMemo(() => {
    const runningLabels = new Set(
      runTabs.filter((t) => runningTabIds.has(t.tabId)).map((t) => t.label)
    )
    return new Set(configs.filter((c) => runningLabels.has(c.label)).map((c) => c.id))
  }, [configs, runTabs, runningTabIds])

  const primary = useMemo(
    () =>
      resolvePrimaryRunTarget({
        configs: orderedConfigs,
        runTabs,
        runningTabIds,
        activeTerminalTabId,
        recentConfigId
      }),
    [orderedConfigs, runTabs, runningTabIds, activeTerminalTabId, recentConfigId]
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

  const handleShow = useCallback(
    (toShow: RunConfiguration[]) => {
      if (repoId) {
        setConfigsHidden(repoId, toShow, false)
      }
    },
    [repoId, setConfigsHidden]
  )

  const handleHide = useCallback(
    (toHide: RunConfiguration[]) => {
      if (repoId) {
        setConfigsHidden(repoId, toHide, true)
      }
    },
    [repoId, setConfigsHidden]
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
            <RunConfigSections
              configs={visibleConfigs}
              runningSet={runningConfigIds}
              hidden={false}
              onSelect={handleConfigAction}
              onToggleVisibility={handleHide}
            />
            {hiddenConfigs.length > 0 ? (
              <>
                {visibleConfigs.length > 0 ? <DropdownMenuSeparator /> : null}
                <RunConfigHiddenSubmenu
                  configs={hiddenConfigs}
                  runningSet={runningConfigIds}
                  onSelect={handleConfigAction}
                  onToggleVisibility={handleShow}
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
