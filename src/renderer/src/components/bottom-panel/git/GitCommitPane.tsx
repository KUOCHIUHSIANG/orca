import { useRef } from 'react'
import { ArrowUpFromLine, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { basename, dirname } from '@/lib/path'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { getScreenSubmitModifierLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { STATUS_COLORS, STATUS_LABELS } from '../../right-sidebar/status-display'
import { CommitMessageComposer } from '../../right-sidebar/source-control/commit/commit-message-composer'
import { toSourceControlRowOpenEvent } from '../../right-sidebar/source-control/listing/split-open'
import { formatCountLabel } from '../../right-sidebar/source-control-dropdown-labels'
import { PaneResizeHandle } from '../pane-resize-handle'
import type { GitChangeRow } from './git-change-rows'
import { GIT_TOOL_WINDOW_LAYOUT_LIMITS, useGitToolWindowState } from './git-tool-window-state'
import { useGitCommitPane } from './use-git-commit-pane'
import type { GitToolWindowModel } from './use-git-tool-window'

const COMMIT_ERROR_ID = 'git-tool-window-commit-error'
const HEADER_HEIGHT = 28
const CHANGES_MIN_HEIGHT = 48

function ChangeRow({
  row,
  pending,
  onToggle,
  onOpen
}: {
  row: GitChangeRow
  pending: boolean
  onToggle: (row: GitChangeRow) => void
  onOpen: (row: GitChangeRow, event: React.MouseEvent) => void
}): React.JSX.Element {
  const dir = dirname(row.path)
  return (
    <div className="flex h-6 items-center gap-1.5 pr-2 pl-3 text-xs hover:bg-accent/50">
      <Checkbox
        checked={row.checked}
        disabled={pending || row.conflicted}
        aria-label={row.checked === true ? `Unstage ${row.path}` : `Stage ${row.path}`}
        onCheckedChange={() => onToggle(row)}
      />
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
        title={row.path}
        onClick={(event) => onOpen(row, event)}
      >
        <span className="min-w-0 truncate">
          <span className="text-foreground">{basename(row.path)}</span>
          {dir !== '.' && <span className="ml-1.5 text-[11px] text-muted-foreground">{dir}</span>}
        </span>
      </button>
      {row.conflicted ? (
        <span className="shrink-0 text-[10px] font-bold text-destructive">!</span>
      ) : (
        <span
          className="w-3 shrink-0 text-center text-[10px] font-bold"
          style={{ color: STATUS_COLORS[row.status] }}
        >
          {STATUS_LABELS[row.status]}
        </span>
      )}
    </div>
  )
}

export function GitCommitPane({ model }: { model: GitToolWindowModel }): React.JSX.Element {
  const pane = useGitCommitPane(model)
  const { context, handleOpenDiff, runRemoteAction } = model
  const { branchName, remoteStatus, isRemoteOperationActive, inFlightRemoteOpKind } = context
  const ahead = remoteStatus?.ahead ?? 0
  const needsPublish = remoteStatus?.hasUpstream === false && !remoteStatus.hasConfiguredPushTarget
  const pushDisabled =
    isRemoteOperationActive || !branchName || (remoteStatus?.hasUpstream === true && ahead === 0)
  const pushing = inFlightRemoteOpKind === 'push' || inFlightRemoteOpKind === 'publish'

  const rootRef = useRef<HTMLDivElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const commitBoxHeight = useGitToolWindowState((state) => state.layout.commitBoxHeight)
  const setLayoutSize = useGitToolWindowState((state) => state.setLayoutSize)

  const openRow = (row: GitChangeRow, event: React.MouseEvent): void => {
    const entry = row.pending ?? row.staged
    if (entry) {
      handleOpenDiff(entry, toSourceControlRowOpenEvent(event))
    }
  }

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border pr-2 pl-3 text-xs">
        <Checkbox
          checked={pane.summary.checked}
          disabled={pane.rows.length === 0 || pane.pendingPaths.size > 0}
          aria-label={pane.summary.checked === true ? 'Unstage all changes' : 'Stage all changes'}
          onCheckedChange={pane.toggleAll}
        />
        <span className="font-medium text-foreground">Changes</span>
        <span className="tabular-nums text-muted-foreground">{pane.rows.length}</span>
        {pane.summary.stagedCount > 0 && (
          <span className="ml-auto tabular-nums text-muted-foreground">
            {pane.summary.stagedCount} staged
          </span>
        )}
      </div>
      <div
        className="scrollbar-sleek flex-1 overflow-y-auto py-0.5"
        style={{ minHeight: CHANGES_MIN_HEIGHT }}
      >
        {pane.rows.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">No local changes</div>
        ) : (
          pane.rows.map((row) => (
            <ChangeRow
              key={row.path}
              row={row}
              pending={pane.pendingPaths.has(row.path)}
              onToggle={pane.toggleRow}
              onOpen={openRow}
            />
          ))
        )}
      </div>
      <PaneResizeHandle
        appearance="hairline"
        axis="y"
        paneRef={boxRef}
        placement="before"
        label="Resize commit message"
        min={GIT_TOOL_WINDOW_LAYOUT_LIMITS.commitBoxHeight.min}
        max={() => (rootRef.current?.clientHeight ?? 0) - HEADER_HEIGHT - CHANGES_MIN_HEIGHT - 6}
        onResize={(size) => setLayoutSize('commitBoxHeight', size)}
      />
      <div
        ref={boxRef}
        className="flex shrink flex-col px-2 pb-2"
        style={{
          height: commitBoxHeight,
          minHeight: GIT_TOOL_WINDOW_LAYOUT_LIMITS.commitBoxHeight.min
        }}
        onKeyDown={(event) => {
          if (isScreenSubmitShortcut(event)) {
            event.preventDefault()
            void pane.commit()
          }
        }}
      >
        <div className="min-h-0 flex-1">
          <CommitMessageComposer
            fillHeight
            rows={2}
            commitMessage={pane.message}
            disabled={pane.isCommitting}
            onCommitMessageChange={pane.setMessage}
            describedBy={pane.commitError ? COMMIT_ERROR_ID : ''}
            showGenerate={false}
            isGenerating={false}
            onCancelGenerate={() => undefined}
            isGenerateDisabled
            onGenerate={() => undefined}
          />
        </div>
        {pane.commitError && (
          <div
            id={COMMIT_ERROR_ID}
            className="scrollbar-sleek mt-1 max-h-16 overflow-y-auto whitespace-pre-wrap break-words text-[11px] text-destructive"
          >
            {pane.commitError}
          </div>
        )}
        <div className="mt-1.5 flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Why the span: a disabled button fires no pointer events, so the tooltip needs a wrapper. */}
              <span className="flex-1">
                <Button
                  type="button"
                  size="xs"
                  className="w-full"
                  disabled={!pane.canCommit}
                  onClick={() => void pane.commit()}
                >
                  {pane.isCommitting && <Loader2 className="size-3.5 animate-spin" />}
                  Commit
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {pane.disabledReason ?? (
                <span className="flex items-center gap-2">
                  <span>Commit staged changes</span>
                  <ShortcutKeyCombo keys={[getScreenSubmitModifierLabel(), 'Enter']} />
                </span>
              )}
            </TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={pushDisabled}
            onClick={() => void runRemoteAction('push')}
          >
            {pushing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowUpFromLine className="size-3.5" />
            )}
            {needsPublish ? 'Publish' : formatCountLabel('Push', ahead)}
          </Button>
        </div>
      </div>
    </div>
  )
}
