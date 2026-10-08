import { useCallback, useMemo, useState } from 'react'
import {
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { useAppStore } from '@/store'
import { isTabDragData, type TabDragItemData } from '../tab-group/tab-drag-data'
import { getDragPointer } from '../tab-group/tab-drag-pointer'
import { TabDragPointerSensor } from '../tab-group/tab-drag-pointer-sensor'
import {
  reorderTabOrderForInsertion,
  resolveTabInsertion,
  useHoveredTabInsertion,
  type HoveredTabInsertion
} from '../tab-group/tab-insertion'
import { collisionDetection, TAB_DRAG_ACTIVATION_DISTANCE_PX } from '../tab-group/useTabDragSplit'
import { mirrorWebRuntimeTabMove } from '../tab-bar/web-runtime-tab-move-mirror'

/** Reorder-only tab drag for the bottom panel; splits and cross-group moves stay in the split layout. */
export function useBottomPanelTabDrag(
  worktreeId: string,
  groupId: string | null
): {
  activeDrag: TabDragItemData | null
  collisionDetection: CollisionDetection
  hoveredTabInsertion: HoveredTabInsertion | null
  sensors: ReturnType<typeof useSensors>
  onDragStart: (event: DragStartEvent) => void
  onDragMove: (event: DragMoveEvent) => void
  onDragEnd: (event: DragEndEvent) => void
  onDragCancel: () => void
} {
  const reorderUnifiedTabs = useAppStore((state) => state.reorderUnifiedTabs)
  const [activeDrag, setActiveDrag] = useState<TabDragItemData | null>(null)
  const tabInsertion = useHoveredTabInsertion(isTabDragData, getDragPointer)
  // Why memoized: fresh options rebuild every tab's drag listeners.
  const pointerSensorOptions = useMemo(
    () => ({ activationConstraint: { distance: TAB_DRAG_ACTIVATION_DISTANCE_PX } }),
    []
  )
  const sensors = useSensors(useSensor(TabDragPointerSensor, pointerSensorOptions))

  const clear = useCallback(() => {
    setActiveDrag(null)
    tabInsertion.clear()
  }, [tabInsertion])

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current
      if (isTabDragData(data) && data.groupId === groupId) {
        setActiveDrag(data)
      }
    },
    [groupId]
  )

  const onDragMove = useCallback(
    (event: DragMoveEvent) => tabInsertion.update(event),
    [tabInsertion]
  )

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeData = event.active.data.current
      const overData = event.over?.data.current
      const insertion = resolveTabInsertion(event, isTabDragData, getDragPointer)
      const group = useAppStore
        .getState()
        .groupsByWorktree[worktreeId]?.find((candidate) => candidate.id === groupId)
      if (
        group &&
        insertion &&
        isTabDragData(activeData) &&
        isTabDragData(overData) &&
        activeData.groupId === group.id &&
        overData.groupId === group.id
      ) {
        const nextOrder = reorderTabOrderForInsertion(
          group.tabOrder,
          activeData.unifiedTabId,
          overData.unifiedTabId,
          insertion.side
        )
        if (nextOrder) {
          reorderUnifiedTabs(group.id, nextOrder)
          mirrorWebRuntimeTabMove({
            kind: 'reorder',
            worktreeId,
            tabId: activeData.unifiedTabId,
            targetGroupId: group.id,
            tabOrder: nextOrder
          })
        }
      }
      clear()
    },
    [clear, groupId, reorderUnifiedTabs, worktreeId]
  )

  return {
    activeDrag,
    collisionDetection,
    hoveredTabInsertion: tabInsertion.hoveredTabInsertion,
    sensors,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel: clear
  }
}
