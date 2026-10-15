import { describe, expect, it } from 'vitest'
import {
  addDays,
  buildMonthDays,
  buildWeekDays,
  isInMonth,
  monthCursorOfIso,
  shiftMonth,
  weekStartOf
} from './calendar-dates'

describe('buildMonthDays', () => {
  it('covers October 2026 in Sunday-first weeks', () => {
    const weeks = buildMonthDays({ year: 2026, month: 9 })
    expect(weeks).toHaveLength(5)
    expect(weeks[0][0]).toBe('2026-09-27')
    expect(weeks[0][4]).toBe('2026-10-01')
    expect(weeks[4][6]).toBe('2026-10-31')
  })

  it('handles a month that needs six rows', () => {
    const weeks = buildMonthDays({ year: 2026, month: 7 })
    expect(weeks).toHaveLength(6)
    expect(weeks[5][1]).toBe('2026-08-31')
  })
})

describe('shiftMonth', () => {
  it('wraps across years', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
  })
})

describe('isInMonth', () => {
  it('matches only days of the cursor month', () => {
    expect(isInMonth('2026-10-01', { year: 2026, month: 9 })).toBe(true)
    expect(isInMonth('2026-09-30', { year: 2026, month: 9 })).toBe(false)
  })
})

describe('weeks', () => {
  it('starts a week on the Sunday on or before a day', () => {
    expect(weekStartOf('2026-10-15')).toBe('2026-10-11') // Thursday
    expect(weekStartOf('2026-10-11')).toBe('2026-10-11') // Sunday
    expect(weekStartOf('2026-11-01')).toBe('2026-11-01')
  })

  it('lists seven days across a month end', () => {
    expect(buildWeekDays('2026-10-25')).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31'
    ])
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('reads a month cursor straight from a date string', () => {
    expect(monthCursorOfIso('2026-10-15')).toEqual({ year: 2026, month: 9 })
  })
})
