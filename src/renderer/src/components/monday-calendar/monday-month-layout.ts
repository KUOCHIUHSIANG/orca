import {
  isDatedMondayItem,
  type DatedMondayItem,
  type MondayCalendarItem
} from '../../../../shared/monday-calendar-types'
import { buildMonthDays, type MonthCursor } from '../calendar/calendar-dates'

export type MondayWeekSegment = {
  item: DatedMondayItem
  /** 0 = Sunday. */
  startColumn: number
  span: number
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export type MondayCalendarWeek = {
  days: string[]
  segments: MondayWeekSegment[]
}

/** Clips items to the week and stacks overlaps into lanes, longest-first per start day. */
export function layoutWeekSegments(
  days: string[],
  items: readonly DatedMondayItem[]
): MondayWeekSegment[] {
  const weekStart = days[0]
  const weekEnd = days.at(-1) ?? weekStart
  const overlapping = items
    .filter((item) => item.startDate <= weekEnd && item.endDate >= weekStart)
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        b.endDate.localeCompare(a.endDate) ||
        a.name.localeCompare(b.name)
    )
  const laneEnds: number[] = []
  return overlapping.map((item) => {
    const continuesBefore = item.startDate < weekStart
    const continuesAfter = item.endDate > weekEnd
    const startColumn = continuesBefore ? 0 : days.indexOf(item.startDate)
    const endColumn = continuesAfter ? days.length - 1 : days.indexOf(item.endDate)
    let lane = laneEnds.findIndex((end) => end < startColumn)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(endColumn)
    } else {
      laneEnds[lane] = endColumn
    }
    return {
      item,
      startColumn,
      span: endColumn - startColumn + 1,
      lane,
      continuesBefore,
      continuesAfter
    }
  })
}

export function buildMonthLayout(
  cursor: MonthCursor,
  items: readonly MondayCalendarItem[]
): MondayCalendarWeek[] {
  const dated = items.filter(isDatedMondayItem)
  return buildMonthDays(cursor).map((days) => ({
    days,
    segments: layoutWeekSegments(days, dated)
  }))
}
