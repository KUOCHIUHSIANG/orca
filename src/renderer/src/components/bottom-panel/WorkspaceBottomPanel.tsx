import { useRef, useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { findDockedGroupId } from '@/store/slices/tabs/tab-group-dock'
import type { TabGroup } from '../../../../shared/tab-types'
import TabGroupPanel from '../tab-group/TabGroupPanel'
import TabDragPreview from '../tab-bar/TabDragPreview'
import { useBottomPanelTabDrag } from './use-bottom-panel-tab-drag'
import {
  MAX_BOTTOM_PANEL_HEIGHT_RATIO,
  MIN_BOTTOM_PANEL_HEIGHT,
  useBottomPanelState
} from '@/lib/bottom-panel-state'

const EMPTY_GROUPS: readonly TabGroup[] = []

function BottomPanelResizeHandle({
  panelRef
}: {
  panelRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const setHeight = useBottomPanelState((state) => state.setHeight)
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const panel = panelRef.current
    if (!panel || dragging) {
      return
    }
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setDragging(true)
    const startY = event.clientY
    const startHeight = panel.getBoundingClientRect().height
    let nextHeight = startHeight
    // Why: write the DOM during the drag and commit once, so the panel store isn't hit per pointermove.
    const onPointerMove = (moveEvent: PointerEvent): void => {
      const maxHeight = window.innerHeight * MAX_BOTTOM_PANEL_HEIGHT_RATIO
      nextHeight = Math.min(
        maxHeight,
        Math.max(MIN_BOTTOM_PANEL_HEIGHT, startHeight + startY - moveEvent.clientY)
      )
      panel.style.height = `${nextHeight}px`
    }
    const onPointerEnd = (): void => {
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', onPointerEnd)
      handle.removeEventListener('pointercancel', onPointerEnd)
      setDragging(false)
      setHeight(nextHeight)
    }
    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerEnd)
    handle.addEventListener('pointercancel', onPointerEnd)
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize bottom panel"
      className={cn('tab-group-split-resize-handle is-horizontal', dragging && 'is-dragging')}
      onPointerDown={onPointerDown}
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

/** Full-width panel under the sidebars and workspace; hosts the worktree's docked tab group. */
export function WorkspaceBottomPanel(): React.JSX.Element | null {
  const open = useBottomPanelState((state) => state.open)
  const height = useBottomPanelState((state) => state.height)
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
      {dockedGroupId ? (
        <DockedGroupPanel worktreeId={worktreeId} groupId={dockedGroupId} isFocused={isFocused} />
      ) : (
        <div className="flex flex-1 items-center justify-center border-t border-border text-xs text-muted-foreground">
          Run a configuration to see its output here.
        </div>
      )}
    </div>
  )
}
