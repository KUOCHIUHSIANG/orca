import { useRef } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { GitBranch, Minus, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { findDockedGroupId, pickCenterGroupId } from '@/store/slices/tabs/tab-group-dock'
import type { TabGroup } from '../../../../shared/tab-types'
import TabGroupPanel from '../tab-group/TabGroupPanel'
import TabDragPreview from '../tab-bar/TabDragPreview'
import { useBottomPanelTabDrag } from './use-bottom-panel-tab-drag'
import { GitToolWindow } from './git/GitToolWindow'
import { PaneResizeHandle } from './pane-resize-handle'
import {
  MAX_BOTTOM_PANEL_HEIGHT_RATIO,
  MIN_BOTTOM_PANEL_HEIGHT,
  useBottomPanelState,
  type BottomPanelTab
} from '@/lib/bottom-panel-state'

const EMPTY_GROUPS: readonly TabGroup[] = []

function BottomPanelResizeHandle({
  panelRef
}: {
  panelRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const setHeight = useBottomPanelState((state) => state.setHeight)
  return (
    <PaneResizeHandle
      axis="y"
      paneRef={panelRef}
      placement="before"
      label="Resize bottom panel"
      min={MIN_BOTTOM_PANEL_HEIGHT}
      max={() => window.innerHeight * MAX_BOTTOM_PANEL_HEIGHT_RATIO}
      onResize={setHeight}
    />
  )
}

function DockedGroupPanel({
  worktreeId,
  groupId,
  isFocused
}: {
  worktreeId: string
  groupId: string
  isFocused: boolean
}): React.JSX.Element {
  const drag = useBottomPanelTabDrag(worktreeId, groupId)
  return (
    // Why: its own DndContext, since the split layout's context ends at the center column.
    <DndContext
      sensors={drag.sensors}
      collisionDetection={drag.collisionDetection}
      onDragStart={drag.onDragStart}
      onDragMove={drag.onDragMove}
      onDragEnd={drag.onDragEnd}
      onDragCancel={drag.onDragCancel}
      autoScroll={false}
    >
      <TabGroupPanel
        groupId={groupId}
        worktreeId={worktreeId}
        isVisible
        isFocused={isFocused}
        hasSplitGroups={false}
        touchesRightEdge
        touchesLeftEdge
        touchesBottomEdge
        reserveClosedExplorerToggleSpace={false}
        reserveCollapsedSidebarHeaderSpace={false}
        hoveredTabInsertion={drag.hoveredTabInsertion}
      />
      {/* Why: the strip clips the dragged tab, so a portal ghost follows the cursor. */}
      <DragOverlay dropAnimation={null}>
        {drag.activeDrag ? <TabDragPreview drag={drag.activeDrag} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

const PANEL_TABS = [
  { value: 'run', label: 'Run', icon: Play },
  { value: 'git', label: 'Git', icon: GitBranch }
] satisfies { value: BottomPanelTab; label: string; icon: typeof Play }[]

/** Vertical tool-window stripe on the panel's left edge, like a JetBrains IDE. */
function BottomPanelToolStrip({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const tab = useBottomPanelState((state) => state.tab)
  const setTab = useBottomPanelState((state) => state.setTab)
  const setOpen = useBottomPanelState((state) => state.setOpen)

  const selectTab = (next: string): void => {
    if (next !== 'run' && next !== 'git') {
      return
    }
    const nextTab: BottomPanelTab = next
    // Why: a hidden run group must not keep focus, or new tabs and shortcuts land off screen.
    if (nextTab !== 'run') {
      const state = useAppStore.getState()
      const groups = state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS
      const activeGroupId = state.activeGroupIdByWorktree[worktreeId]
      if (activeGroupId && activeGroupId === findDockedGroupId(groups)) {
        const centerGroupId = pickCenterGroupId(
          groups,
          state.unifiedTabsByWorktree[worktreeId] ?? [],
          activeGroupId
        )
        if (centerGroupId) {
          state.focusGroup(worktreeId, centerGroupId)
        }
      }
    }
    setTab(nextTab)
  }

  return (
    <div className="flex w-10 shrink-0 flex-col items-center border-r border-border py-1">
      {/* Why toggles: like a JetBrains stripe, clicking the open tool window's icon hides the panel. */}
      <ToggleGroup
        type="single"
        orientation="vertical"
        spacing={1}
        className="flex-col"
        aria-label="Bottom panel"
        value={tab}
        onValueChange={(value) => (value ? selectTab(value) : setOpen(false))}
      >
        {PANEL_TABS.map(({ value, label, icon: Icon }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={value} size="sm" aria-label={label}>
                <Icon className={cn(value !== tab && 'text-muted-foreground')} />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={4}>
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="mt-auto"
            aria-label="Hide bottom panel"
            onClick={() => setOpen(false)}
          >
            <Minus className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={4}>
          Hide bottom panel
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

/** Full-width panel under the sidebars and workspace; hosts the Run group and the Git tool window. */
export function WorkspaceBottomPanel(): React.JSX.Element | null {
  const open = useBottomPanelState((state) => state.open)
  const height = useBottomPanelState((state) => state.height)
  const tab = useBottomPanelState((state) => state.tab)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const worktreeId = useAppStore((state) =>
    state.activeView === 'terminal' ? state.activeWorktreeId : null
  )
  const dockedGroupId = useAppStore((state) =>
    worktreeId ? findDockedGroupId(state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS) : null
  )
  const isFocused = useAppStore((state) =>
    Boolean(
      worktreeId && dockedGroupId && state.activeGroupIdByWorktree[worktreeId] === dockedGroupId
    )
  )

  if (!open || !worktreeId) {
    return null
  }

  return (
    <div
      ref={panelRef}
      className="flex shrink-0 flex-col bg-background"
      style={{ height, maxHeight: `${MAX_BOTTOM_PANEL_HEIGHT_RATIO * 100}vh` }}
      data-bottom-panel=""
    >
      <BottomPanelResizeHandle panelRef={panelRef} />
      <div className="flex min-h-0 flex-1 border-t border-border">
        <BottomPanelToolStrip worktreeId={worktreeId} />
        <div className="flex min-w-0 flex-1 flex-col">
          {tab === 'git' ? (
            <GitToolWindow />
          ) : dockedGroupId ? (
            <DockedGroupPanel
              worktreeId={worktreeId}
              groupId={dockedGroupId}
              isFocused={isFocused}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
              Run a configuration to see its output here.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
