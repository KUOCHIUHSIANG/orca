/** Calendar days are local `YYYY-MM-DD` strings; month is 0-based, matching Date. */
export type MonthCursor = { year: number; month: number }

const DAY_MS = 86_400_000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

// Why: grid math runs in UTC so DST transitions can't skip or repeat a calendar day.
function isoFromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function utcMsOf(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
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

export function monthCursorOfIso(iso: string): MonthCursor {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 }
}

export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1))
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() }
}

export function isInMonth(iso: string, cursor: MonthCursor): boolean {
  return iso.startsWith(`${cursor.year}-${pad(cursor.month + 1)}-`)
}

export function addDays(iso: string, days: number): string {
  return isoFromUtcMs(utcMsOf(iso) + days * DAY_MS)
}

/** The Sunday on or before `iso`; calendars here are Sunday-first. */
export function weekStartOf(iso: string): string {
  return addDays(iso, -new Date(utcMsOf(iso)).getUTCDay())
}

export function buildWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, day) => addDays(weekStart, day))
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
