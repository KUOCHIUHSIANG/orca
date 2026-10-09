import { useRef } from 'react'
import { PaneResizeHandle } from '../pane-resize-handle'
import { GitCommitDetails } from './GitCommitDetails'
import { GitCommitPane } from './GitCommitPane'
import { GitLogList } from './GitLogList'
import { GitToolWindowToolbar } from './GitToolWindowToolbar'
import { GIT_TOOL_WINDOW_LAYOUT_LIMITS, useGitToolWindowState } from './git-tool-window-state'
import { useGitToolWindow } from './use-git-tool-window'

const LOG_MIN_WIDTH = 240
const HANDLE_SIZE = 6

function GitToolWindowNotice({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
      {children}
    </div>
  )
}

/** The bottom panel's Git tab: commit pane, branch log and the selected commit's changes. */
export function GitToolWindow(): React.JSX.Element {
  const model = useGitToolWindow()
  const commitPaneOpen = useGitToolWindowState((state) => state.commitPaneOpen)
  const layout = useGitToolWindowState((state) => state.layout)
  const setLayoutSize = useGitToolWindowState((state) => state.setLayoutSize)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const commitPaneRef = useRef<HTMLDivElement | null>(null)
  const detailsRef = useRef<HTMLDivElement | null>(null)
  const { activeWorktreeId, worktreePath, isFolder } = model.context

  // Why: a side column may only grow into the log's space, never past the log's minimum.
  const widthLeftBeside = (other: React.RefObject<HTMLDivElement | null>): number =>
    (rowRef.current?.clientWidth ?? 0) -
    (other.current?.getBoundingClientRect().width ?? 0) -
    LOG_MIN_WIDTH -
    2 * HANDLE_SIZE

  if (!activeWorktreeId || !worktreePath) {
    return <GitToolWindowNotice>Select a workspace to see its git history.</GitToolWindowNotice>
  }
  if (isFolder) {
    return <GitToolWindowNotice>This folder workspace is not a git repository.</GitToolWindowNotice>
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GitToolWindowToolbar model={model} />
      <div ref={rowRef} className="flex min-h-0 flex-1">
        {commitPaneOpen && (
          <>
            <div
              ref={commitPaneRef}
              className="flex min-h-0 shrink flex-col"
              style={{
                width: layout.commitPaneWidth,
                minWidth: GIT_TOOL_WINDOW_LAYOUT_LIMITS.commitPaneWidth.min
              }}
            >
              <GitCommitPane model={model} />
            </div>
            <PaneResizeHandle
              appearance="hairline"
              axis="x"
              paneRef={commitPaneRef}
              placement="after"
              label="Resize commit pane"
              min={GIT_TOOL_WINDOW_LAYOUT_LIMITS.commitPaneWidth.min}
              max={() => widthLeftBeside(detailsRef)}
              onResize={(size) => setLayoutSize('commitPaneWidth', size)}
            />
          </>
        )}
        <div className="flex min-h-0 min-w-40 flex-1 flex-col">
          <GitLogList model={model} />
        </div>
        <PaneResizeHandle
          appearance="hairline"
          axis="x"
          paneRef={detailsRef}
          placement="before"
          label="Resize commit details"
          min={GIT_TOOL_WINDOW_LAYOUT_LIMITS.detailsWidth.min}
          max={() => widthLeftBeside(commitPaneRef)}
          onResize={(size) => setLayoutSize('detailsWidth', size)}
        />
        <div
          ref={detailsRef}
          className="flex min-h-0 shrink flex-col"
          style={{
            width: layout.detailsWidth,
            minWidth: GIT_TOOL_WINDOW_LAYOUT_LIMITS.detailsWidth.min
          }}
        >
          <GitCommitDetails model={model} />
        </div>
      </div>
    </div>
  )
}
