import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { groupRunConfigurationsForMenu } from '@/lib/run-configuration-menu'
import type { RunTab } from '@/lib/run-configuration-tabs'
import type { RunConfiguration } from '../../../../shared/run-configuration-types'

type ConfigIcon = React.ComponentType<{ className?: string }>

export function RunConfigSectionHeader({
  icon,
  label
}: {
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
    </div>
  )
}

/** Running services of this worktree: select jumps to the tab, the trailing button stops it. */
export function TabBarRunConfigRunningSection({
  runTabs,
  runningTabIds,
  onStop
}: {
  runTabs: readonly RunTab[]
  runningTabIds: ReadonlySet<string>
  onStop: (tabId: string) => void
}): React.JSX.Element | null {
  const running = runTabs.filter((t) => runningTabIds.has(t.tabId))
  if (running.length === 0) {
    return null
  }
  return (
    <>
      <RunConfigSectionHeader
        icon={<span className="size-1.5 rounded-full bg-status-success" />}
        label="Running"
      />
      {running.map((tab) => (
        <DropdownMenuItem key={tab.tabId} onSelect={() => activateTabAndFocusPane(tab.tabId, null)}>
          <span className="size-1.5 shrink-0 rounded-full bg-status-success" />
          <span className="min-w-0 flex-1 truncate">{tab.label}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Stop ${tab.label}`}
            // Why: keep the click from also selecting the row, which would jump to the tab.
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onStop(tab.tabId)
            }}
          >
            <Square className="size-3 text-destructive" fill="currentColor" strokeWidth={0} />
          </Button>
        </DropdownMenuItem>
      ))}
      {running.length > 1 ? (
        <DropdownMenuItem onSelect={() => running.forEach((tab) => onStop(tab.tabId))}>
          <Square
            className="size-3 shrink-0 text-destructive"
            fill="currentColor"
            strokeWidth={0}
          />
          <span className="min-w-0 flex-1 truncate">Stop all</span>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
    </>
  )
}

function RunStateIcon({
  Icon,
  running
}: {
  Icon: ConfigIcon
  running: boolean
}): React.JSX.Element {
  return running ? (
    <Square className="size-3 shrink-0 text-destructive" fill="currentColor" strokeWidth={0} />
  ) : (
    <Icon className="size-3 shrink-0 text-muted-foreground" />
  )
}

function RunningBadge({ running }: { running: boolean }): React.JSX.Element | null {
  return running ? <span className="text-[10px] text-muted-foreground">Running</span> : null
}

function RunConfigMenuItem({
  config,
  label,
  Icon,
  running,
  onSelect
}: {
  config: RunConfiguration
  label: string
  Icon: ConfigIcon
  running: boolean
  onSelect: (config: RunConfiguration) => void
}): React.JSX.Element {
  return (
    <DropdownMenuItem onSelect={() => onSelect(config)}>
      <RunStateIcon Icon={Icon} running={running} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {config.detail ? (
          <span className="truncate font-mono text-xs text-muted-foreground">{config.detail}</span>
        ) : null}
      </span>
      <RunningBadge running={running} />
    </DropdownMenuItem>
  )
}

export function TabBarRunConfigMenuEntries({
  configs,
  Icon,
  runningSet,
  onSelect
}: {
  configs: RunConfiguration[]
  Icon: ConfigIcon
  runningSet: ReadonlySet<string>
  onSelect: (config: RunConfiguration) => void
}): React.JSX.Element {
  return (
    <>
      {groupRunConfigurationsForMenu(configs).map((entry) => {
        if (entry.kind === 'item') {
          return (
            <RunConfigMenuItem
              key={entry.config.id}
              config={entry.config}
              label={entry.config.label}
              Icon={Icon}
              running={runningSet.has(entry.config.id)}
              onSelect={onSelect}
            />
          )
        }
        const anyRunning = entry.configs.some((c) => runningSet.has(c.id))
        return (
          <DropdownMenuSub key={entry.key}>
            <DropdownMenuSubTrigger>
              <RunStateIcon Icon={Icon} running={anyRunning} />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              <RunningBadge running={anyRunning} />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-w-80">
              {entry.configs.map((config) => (
                <RunConfigMenuItem
                  key={config.id}
                  config={config}
                  label={config.group?.itemLabel ?? config.label}
                  Icon={Icon}
                  running={runningSet.has(config.id)}
                  onSelect={onSelect}
                />
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )
      })}
    </>
  )
}
