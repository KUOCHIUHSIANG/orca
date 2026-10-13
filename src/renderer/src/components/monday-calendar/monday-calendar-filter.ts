import type {
  MondayBoardDisplaySettings,
  MondayBoardSummary,
  MondayCalendarItem,
  MondayCalendarSnapshot,
  MondayPerson
} from '../../../../shared/monday-calendar-types'
import { parseIsoDate, toLocalIsoDate } from './monday-month-layout'

/** First day (Sunday) of the oldest week in an N-week window that ends with the current week. */
export function recentWindowStart(today: string, weeks: number): string {
  const date = parseIsoDate(today)
  date.setDate(date.getDate() - date.getDay() - (weeks - 1) * 7)
  return toLocalIsoDate(date)
}

export function filterMondayItems(
  items: readonly MondayCalendarItem[],
  options: {
    selectedPersonIds: readonly string[] | null
    selectedBoardIds: readonly string[] | null
    boardSettings: MondayBoardDisplaySettings
    showDone: boolean
    /** Local YYYY-MM-DD; anchors per-board recent-week windows. */
    today: string
  }
): MondayCalendarItem[] {
  const people = options.selectedPersonIds ? new Set(options.selectedPersonIds) : null
  const boards = options.selectedBoardIds ? new Set(options.selectedBoardIds) : null
  return items.filter((item) => {
    const boardSetting = options.boardSettings[item.boardId]
    if (item.isDone && !options.showDone && boardSetting?.includeDone !== true) {
      return false
    }
    // Why: undated tasks can't be placed in a window, so a windowed board drops them too.
    if (
      boardSetting?.recentWeeks &&
      (item.endDate === null ||
        item.endDate < recentWindowStart(options.today, boardSetting.recentWeeks))
    ) {
      return false
    }
    if (boards && !boards.has(item.boardId)) {
      return false
    }
    if (boardSetting?.groupId && item.groupId !== boardSetting.groupId) {
      return false
    }
    return (
      !people ||
      boardSetting?.ignorePeopleFilter === true ||
      item.ownerIds.some((ownerId) => people.has(ownerId))
    )
  })
}

/** Drops board ids that are no longer subscribed; an empty result means "every board". */
export function effectiveBoardSelection(
  selectedBoardIds: readonly string[] | null,
  boards: readonly MondayBoardSummary[]
): string[] | null {
  if (!selectedBoardIds) {
    return null
  }
  const known = selectedBoardIds.filter((id) => boards.some((board) => board.id === id))
  return known.length > 0 ? known : null
}

/**
 * Checkbox semantics for the board filter: "all" (null) means every board is checked, and the
 * last checked board can't be unchecked. Every board checked collapses back to null so boards
 * added later are included automatically.
 */
export function toggleMondayBoardSelection(
  selected: readonly string[] | null,
  boardIds: readonly string[],
  boardId: string
): string[] | null {
  const current = selected ?? boardIds
  const next = current.includes(boardId)
    ? current.filter((id) => id !== boardId)
    : [...current, boardId]
  if (next.length === 0) {
    return selected ? [...selected] : null
  }
  return boardIds.every((id) => next.includes(id))
    ? null
    : boardIds.filter((id) => next.includes(id))
}

/** People who own at least one task, so the filter never offers an empty choice. */
export function listMondayPeopleWithItems(snapshot: MondayCalendarSnapshot | null): MondayPerson[] {
  if (!snapshot) {
    return []
  }
  const ownerIds = new Set(snapshot.items.flatMap((item) => item.ownerIds))
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
  return snapshot.people
    .filter((person) => ownerIds.has(person.id))
    .sort((a, b) => collator.compare(a.name, b.name))
}

/** Owner names to print on a bar: only the filtered people, or everyone when unfiltered. */
export function ownerNamesForItem(
  item: MondayCalendarItem,
  peopleById: ReadonlyMap<string, string>,
  selectedPersonIds: readonly string[] | null
): string[] {
  return item.ownerIds
    .filter((ownerId) => !selectedPersonIds || selectedPersonIds.includes(ownerId))
    .map((ownerId) => peopleById.get(ownerId))
    .filter((name): name is string => Boolean(name))
}
