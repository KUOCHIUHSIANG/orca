import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { GitBranchChangeEntry } from '../../../../../shared/git-diff-compare-types'
import { CommitFileRow } from '../../right-sidebar/source-control/sync/git-history-commit-files'
import { formatGitHistoryTimestamp } from '../../right-sidebar/source-control/sync/git-history-format'
import { PaneResizeHandle } from '../pane-resize-handle'
import { GIT_TOOL_WINDOW_LAYOUT_LIMITS, useGitToolWindowState } from './git-tool-window-state'
import type { GitToolWindowModel } from './use-git-tool-window'

type CommitFilesState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; entries: GitBranchChangeEntry[] }

const LOADING: CommitFilesState = { status: 'loading' }
const HEADER_HEIGHT = 28
const FILES_MIN_HEIGHT = 48

export function GitCommitDetails({ model }: { model: GitToolWindowModel }): React.JSX.Element {
  const {
    context,
    gitHistoryState,
    loadCommitFiles,
    openCommitFile,
    openHistoryCommitDiff,
    handleCommitAction
  } = model
  const worktreeId = context.activeWorktreeId
  const selectedId = useGitToolWindowState((state) =>
    worktreeId ? (state.selectedCommitByWorktree[worktreeId] ?? null) : null
  )
  const item = gitHistoryState.result?.items.find((candidate) => candidate.id === selectedId)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const infoRef = useRef<HTMLDivElement | null>(null)
  const commitInfoHeight = useGitToolWindowState((state) => state.layout.commitInfoHeight)
  const setLayoutSize = useGitToolWindowState((state) => state.setLayoutSize)
  const [loaded, setLoaded] = useState<{ id: string; state: CommitFilesState } | null>(null)
  const files = item && loaded?.id === item.id ? loaded.state : LOADING

  useEffect(() => {
    if (!item) {
      return
    }
    let stale = false
    loadCommitFiles(item)
      .then((entries) => {
        if (!stale) {
          setLoaded({ id: item.id, state: { status: 'ready', entries } })
        }
      })
      .catch((error: unknown) => {
        if (!stale) {
          setLoaded({
            id: item.id,
            state: {
              status: 'error',
              error: error instanceof Error ? error.message : 'Failed to load commit files'
            }
          })
        }
      })
    return () => {
      stale = true
    }
    // A refreshed history re-runs this for the same commit; loadCommitFiles answers from its cache.
  }, [item, loadCommitFiles])

  if (!item) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
        Select a commit to view its changes
      </div>
    )
  }

  const body = item.message.slice(item.subject.length).trim()
  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-border pr-1 pl-3 text-xs text-muted-foreground">
        <span>
          {files.status === 'ready'
            ? `${files.entries.length} changed ${files.entries.length === 1 ? 'file' : 'files'}`
            : 'Changed files'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={files.status !== 'ready' || files.entries.length === 0}
          onClick={() => void openHistoryCommitDiff(item)}
        >
          <ArrowUpRight className="size-3.5" />
          Open all
        </Button>
      </div>
      <div
        className="scrollbar-sleek flex-1 overflow-y-auto"
        style={{ minHeight: FILES_MIN_HEIGHT }}
      >
        {files.status === 'loading' && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading files…
          </div>
        )}
        {files.status === 'error' && (
          <div className="px-3 py-1.5 text-xs text-destructive">{files.error}</div>
        )}
        {files.status === 'ready' &&
          files.entries.map((entry) => (
            <CommitFileRow
              key={entry.path}
              entry={entry}
              className="pl-3"
              onOpen={(fileEntry, event) => openCommitFile(item, fileEntry, event)}
            />
          ))}
      </div>
      <PaneResizeHandle
        appearance="hairline"
        axis="y"
        paneRef={infoRef}
        placement="before"
        label="Resize commit info"
        min={GIT_TOOL_WINDOW_LAYOUT_LIMITS.commitInfoHeight.min}
        max={() => (rootRef.current?.clientHeight ?? 0) - HEADER_HEIGHT - FILES_MIN_HEIGHT - 6}
        onResize={(size) => setLayoutSize('commitInfoHeight', size)}
      />
      <div
        ref={infoRef}
        className="scrollbar-sleek shrink overflow-y-auto px-3 pt-1 pb-2 text-xs"
        style={{
          height: commitInfoHeight,
          minHeight: GIT_TOOL_WINDOW_LAYOUT_LIMITS.commitInfoHeight.min
        }}
      >
        <div className="font-medium text-foreground">{item.subject}</div>
        {body && (
          <div className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{body}</div>
        )}
        <div className="mt-2 flex items-center gap-1 text-muted-foreground">
          <span className="font-mono">{item.displayId ?? item.id.slice(0, 7)}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Copy commit hash"
                onClick={() => handleCommitAction('copy-hash', item)}
              >
                <Copy className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              Copy commit hash
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="text-muted-foreground">
          {[item.author, item.authorEmail && `<${item.authorEmail}>`].filter(Boolean).join(' ')}
        </div>
        <div className="text-muted-foreground">{formatGitHistoryTimestamp(item.timestamp)}</div>
      </div>
    </div>
  )
}
