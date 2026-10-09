import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CloudDownload,
  GitBranch,
  Loader2,
  PanelLeft,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatCountLabel } from '../../right-sidebar/source-control-dropdown-labels'
import { GitLogRefPicker } from './GitLogRefPicker'
import { useGitToolWindowState } from './git-tool-window-state'
import type { GitToolWindowModel, GitToolWindowRemoteAction } from './use-git-tool-window'

function RemoteActionButton({
  kind,
  label,
  icon: Icon,
  disabled,
  inFlight,
  onRun
}: {
  kind: GitToolWindowRemoteAction
  label: string
  icon: typeof CloudDownload
  disabled: boolean
  inFlight: boolean
  onRun: (kind: GitToolWindowRemoteAction) => void
}): React.JSX.Element {
  return (
    <Button type="button" variant="ghost" size="xs" disabled={disabled} onClick={() => onRun(kind)}>
      {inFlight ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {label}
    </Button>
  )
}

export function GitToolWindowToolbar({ model }: { model: GitToolWindowModel }): React.JSX.Element {
  const { context, gitHistoryState, runRemoteAction, refreshAll } = model
  const { branchName, remoteStatus, isRemoteOperationActive, inFlightRemoteOpKind } = context
  const commitPaneOpen = useGitToolWindowState((state) => state.commitPaneOpen)
  const toggleCommitPane = useGitToolWindowState((state) => state.toggleCommitPane)
  const hasUpstream = remoteStatus?.hasUpstream === true
  const ahead = remoteStatus?.ahead ?? 0
  const behind = remoteStatus?.behind ?? 0
  const needsPublish = remoteStatus?.hasUpstream === false && !remoteStatus.hasConfiguredPushTarget
  const refreshing = gitHistoryState.status === 'loading' || gitHistoryState.status === 'refreshing'
  const commitPaneLabel = commitPaneOpen ? 'Hide commit pane' : 'Show commit pane'

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={commitPaneLabel}
            aria-pressed={commitPaneOpen}
            onClick={toggleCommitPane}
          >
            <PanelLeft className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {commitPaneLabel}
        </TooltipContent>
      </Tooltip>
      <div className="flex min-w-0 items-center gap-1 px-1 text-xs text-muted-foreground">
        <GitBranch className="size-3.5 shrink-0" />
        <span className="truncate text-foreground">{branchName || 'Detached HEAD'}</span>
        {remoteStatus?.upstreamName && (
          <span className="truncate">→ {remoteStatus.upstreamName}</span>
        )}
        {(ahead > 0 || behind > 0) && (
          <span className="shrink-0 tabular-nums">
            ↑{ahead} ↓{behind}
          </span>
        )}
      </div>
      <GitLogRefPicker model={model} />
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <RemoteActionButton
          kind="fetch"
          label="Fetch"
          icon={CloudDownload}
          disabled={isRemoteOperationActive}
          inFlight={inFlightRemoteOpKind === 'fetch'}
          onRun={runRemoteAction}
        />
        <RemoteActionButton
          kind="pull"
          label={formatCountLabel('Pull', behind)}
          icon={ArrowDownToLine}
          disabled={isRemoteOperationActive || !hasUpstream || !branchName}
          inFlight={inFlightRemoteOpKind === 'pull'}
          onRun={runRemoteAction}
        />
        <RemoteActionButton
          kind="push"
          label={needsPublish ? 'Publish' : formatCountLabel('Push', ahead)}
          icon={ArrowUpFromLine}
          disabled={isRemoteOperationActive || !branchName || (hasUpstream && ahead === 0)}
          inFlight={inFlightRemoteOpKind === 'push' || inFlightRemoteOpKind === 'publish'}
          onRun={runRemoteAction}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Refresh"
              onClick={refreshAll}
            >
              <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            Refresh
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
