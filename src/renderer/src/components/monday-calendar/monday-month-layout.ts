import {
  isDatedMondayItem,
  type DatedMondayItem,
  type MondayCalendarItem
} from '../../../../shared/monday-calendar-types'

/** month is 0-based, matching Date. */
export type MonthCursor = { year: number; month: number }

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

const DAY_MS = 86_400_000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

// Why: grid math runs in UTC so DST transitions can't skip or repeat a calendar day.
function isoFromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function monthCursorOf(date: Date): MonthCursor {
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1))
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() }
}

export function isInMonth(iso: string, cursor: MonthCursor): boolean {
  return iso.startsWith(`${cursor.year}-${pad(cursor.month + 1)}-`)
}

/** Sunday-first weeks covering the whole month (4–6 rows). */
export function buildMonthDays(cursor: MonthCursor): string[][] {
  const firstMs = Date.UTC(cursor.year, cursor.month, 1)
  const leadingDays = new Date(firstMs).getUTCDay()
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate()
  const gridStartMs = firstMs - leadingDays * DAY_MS
  const weekCount = Math.ceil((leadingDays + daysInMonth) / 7)
  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => isoFromUtcMs(gridStartMs + (week * 7 + day) * DAY_MS))
  )
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
