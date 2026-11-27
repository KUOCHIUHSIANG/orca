import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  isDatedMondayItem,
  type MondayCalendarItem,
  type MondayCalendarSnapshot
} from '../../../../shared/monday-calendar-types'
import { monthCursorOfIso, toLocalIsoDate, type MonthCursor } from '../calendar/calendar-dates'

// Matches monday-item-reveal.css: three 600 ms pulses.
const FLASH_MS = 1_800

/** The month that shows a task: the shown one if the task touches it, else its month nearest today. */
export function monthShowingItem(
  item: MondayCalendarItem,
  shown: MonthCursor,
  today: string
): MonthCursor {
  if (!isDatedMondayItem(item)) {
    return shown
  }
  const first = toLocalIsoDate(new Date(shown.year, shown.month, 1))
  const last = toLocalIsoDate(new Date(shown.year, shown.month + 1, 0))
  if (item.startDate <= last && item.endDate >= first) {
    return shown
  }
  if (item.startDate <= today && today <= item.endDate) {
    return monthCursorOfIso(today)
  }
  return monthCursorOfIso(today < item.startDate ? item.startDate : item.endDate)
}

type PendingReveal = { itemId: string; onMissing: () => void }

export type MondayItemSelection = {
  /** The filtered tasks, plus a revealed one the filters hide. */
  items: readonly MondayCalendarItem[]
  selectedItemId: string | null
  selectItem: (itemId: string | null) => void
  flashingItemId: string | null
  /** Picks and flashes a task, once the calendar has loaded; `onMissing` when it isn't on the boards. */
  reveal: (itemId: string, onMissing: () => void) => void
}

export function useMondayItemSelection(args: {
  snapshot: MondayCalendarSnapshot | null
  filteredItems: readonly MondayCalendarItem[]
  cursor: MonthCursor
  onCursorChange: (cursor: MonthCursor) => void
  today: string
  onRevealUndated: () => void
}): MondayItemSelection {
  const { snapshot, filteredItems, cursor, onCursorChange, today, onRevealUndated } = args
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  // Why: a task a notification revealed stays on the calendar while picked, whatever the filters say.
  const [pinnedItemId, setPinnedItemId] = useState<string | null>(null)
  const [flashingItemId, setFlashingItemId] = useState<string | null>(null)
  const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(null)

  const items = useMemo(() => {
    const pinned = pinnedItemId ? snapshot?.items.find((item) => item.id === pinnedItemId) : null
    return pinned && !filteredItems.some((item) => item.id === pinned.id)
      ? [...filteredItems, pinned]
      : filteredItems
  }, [filteredItems, pinnedItemId, snapshot])

  useEffect(() => {
    if (!pendingReveal || !snapshot) {
      return
    }
    setPendingReveal(null)
    const item = snapshot.items.find((candidate) => candidate.id === pendingReveal.itemId)
    if (!item) {
      pendingReveal.onMissing()
      return
    }
    setSelectedItemId(item.id)
    setPinnedItemId(item.id)
    setFlashingItemId(item.id)
    onCursorChange(monthShowingItem(item, cursor, today))
    if (!isDatedMondayItem(item)) {
      onRevealUndated()
    }
  }, [cursor, onCursorChange, onRevealUndated, pendingReveal, snapshot, today])

  useEffect(() => {
    if (!flashingItemId) {
      return
    }
    const timer = setTimeout(() => setFlashingItemId(null), FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashingItemId])

  const selectItem = useCallback((itemId: string | null): void => {
    setSelectedItemId(itemId)
    setPinnedItemId((pinned) => (pinned === itemId ? pinned : null))
  }, [])

  return {
    items,
    selectedItemId,
    selectItem,
    flashingItemId,
    reveal: (itemId, onMissing) => {
      // Cleared first so revealing the same task again restarts the flash.
      setFlashingItemId(null)
      setPendingReveal({ itemId, onMissing })
    }
  }
}
