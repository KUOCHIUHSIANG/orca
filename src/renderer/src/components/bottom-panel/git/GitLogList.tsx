import { forwardRef, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { GIT_HISTORY_MAX_LIMIT, type GitHistoryItem } from '../../../../../shared/git-history'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels,
  type GitHistoryItemViewModel
} from '../../../../../shared/git-history-graph'
import { dedupeRemoteTrackingRefs } from '../../../../../shared/git-history-ref-display'
import { GitHistoryCommitContextMenu } from '../../right-sidebar/source-control/sync/git-history-commit-context-menu'
import { GitHistoryGraphSvg } from '../../right-sidebar/source-control/sync/git-history-graph-svg'
import { GitHistoryRefBadge } from '../../right-sidebar/source-control/sync/git-history-row'
import { useGitToolWindowState } from './git-tool-window-state'
import type { GitToolWindowModel } from './use-git-tool-window'

const MAX_VISIBLE_REFS = 3
const logDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short'
})

function formatLogDate(timestamp: number | undefined): string {
  return timestamp != null && Number.isFinite(timestamp)
    ? logDateFormatter.format(new Date(timestamp))
    : ''
}

type GitLogRowProps = React.HTMLAttributes<HTMLDivElement> & {
  viewModel: GitHistoryItemViewModel
  selected: boolean
  onSelectCommit: (item: GitHistoryItem) => void
  onOpenCommit: (item: GitHistoryItem) => void
}

// Why forwardRef + rest props: ContextMenuTrigger asChild hands its handlers to this row.
const GitLogRow = forwardRef<HTMLDivElement, GitLogRowProps>(function GitLogRow(
  { viewModel, selected, onSelectCommit, onOpenCommit, className, ...rootProps },
  ref
): React.JSX.Element {
  const item = viewModel.historyItem
  const refs = dedupeRemoteTrackingRefs(item.references ?? [])
  return (
    <div
      {...rootProps}
      ref={ref}
      role="option"
      id={`git-log-row-${item.id}`}
      aria-selected={selected}
      data-current={selected ? 'true' : undefined}
      title={item.message || item.subject}
      className={cn(
        'grid h-6 cursor-pointer grid-cols-[minmax(0,1fr)_9rem_8.5rem] items-center gap-x-3 pr-3 pl-2 text-xs',
        selected ? 'bg-accent' : 'hover:bg-accent/50',
        className
      )}
      onClick={() => onSelectCommit(item)}
      onDoubleClick={() => onOpenCommit(item)}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <GitHistoryGraphSvg viewModel={viewModel} />
        <span className="min-w-0 truncate text-foreground">{item.subject}</span>
        {refs.length > 0 && (
          <span className="flex shrink-0 items-center gap-1">
            {refs.slice(0, MAX_VISIBLE_REFS).map((itemRef) => (
              <GitHistoryRefBadge key={itemRef.id} itemRef={itemRef} />
            ))}
            {refs.length > MAX_VISIBLE_REFS && (
              <span className="text-[10px] text-muted-foreground">
                +{refs.length - MAX_VISIBLE_REFS}
              </span>
            )}
          </span>
        )}
      </div>
      <span className="truncate text-muted-foreground">{item.author}</span>
      <span className="truncate text-right tabular-nums text-muted-foreground">
        {formatLogDate(item.timestamp)}
      </span>
    </div>
  )
})

export function GitLogList({ model }: { model: GitToolWindowModel }): React.JSX.Element {
  const {
    context,
    gitHistoryState,
    limit,
    loadMore,
    refreshGitHistoryRef,
    handleCommitAction,
    openHistoryCommitDiff
  } = model
  const worktreeId = context.activeWorktreeId
  const selectedId = useGitToolWindowState((state) =>
    worktreeId ? (state.selectedCommitByWorktree[worktreeId] ?? null) : null
  )
  const setSelectedCommit = useGitToolWindowState((state) => state.setSelectedCommit)
  const listRef = useRef<HTMLDivElement | null>(null)
  const result = gitHistoryState.result
  const viewModels = useMemo(
    () =>
      result
        ? // Why no boundary rows: this log lists the upstream's real commits instead of a placeholder.
          buildGitHistoryViewModels(
            result.items,
            buildDefaultGitHistoryColorMap(result),
            result.currentRef,
            result.remoteRef,
            result.baseRef,
            false,
            false,
            result.mergeBase
          )
        : [],
    [result]
  )

  const select = (item: GitHistoryItem): void => {
    if (worktreeId) {
      setSelectedCommit(worktreeId, item.id)
    }
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    const index = viewModels.findIndex((viewModel) => viewModel.historyItem.id === selectedId)
    if (event.key === 'Enter') {
      const item = viewModels[index]?.historyItem
      if (item) {
        void openHistoryCommitDiff(item)
      }
      return
    }
    const nextIndex =
      index === -1
        ? 0
        : Math.min(viewModels.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))
    const next = viewModels[nextIndex]?.historyItem
    if (next) {
      select(next)
      listRef.current
        ?.querySelector(`#${CSS.escape(`git-log-row-${next.id}`)}`)
        ?.scrollIntoView({ block: 'nearest' })
    }
  }

  if (!result) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
        {gitHistoryState.status === 'error' ? (
          <>
            <span className="text-destructive">{gitHistoryState.error}</span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void refreshGitHistoryRef.current()}
            >
              Retry
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Loading commits…
          </>
        )}
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Commits"
      tabIndex={0}
      aria-activedescendant={selectedId ? `git-log-row-${selectedId}` : undefined}
      className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      onKeyDown={onKeyDown}
    >
      {gitHistoryState.status === 'error' && (
        <div className="px-3 py-1 text-xs text-destructive">{gitHistoryState.error}</div>
      )}
      {viewModels.length === 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground">No commits yet</div>
      )}
      {viewModels.map((viewModel) => (
        <ContextMenu key={viewModel.historyItem.id}>
          <ContextMenuTrigger asChild>
            <GitLogRow
              viewModel={viewModel}
              selected={viewModel.historyItem.id === selectedId}
              onSelectCommit={select}
              onOpenCommit={(item) => void openHistoryCommitDiff(item)}
            />
          </ContextMenuTrigger>
          <GitHistoryCommitContextMenu item={viewModel.historyItem} onAction={handleCommitAction} />
        </ContextMenu>
      ))}
      {result.hasMore && (
        <div className="flex h-7 items-center px-3 text-xs text-muted-foreground">
          {limit < GIT_HISTORY_MAX_LIMIT ? (
            <Button type="button" variant="ghost" size="xs" onClick={loadMore}>
              Load more commits
            </Button>
          ) : (
            `Showing the latest ${GIT_HISTORY_MAX_LIMIT} commits`
          )}
        </div>
      )}
    </div>
  )
}
