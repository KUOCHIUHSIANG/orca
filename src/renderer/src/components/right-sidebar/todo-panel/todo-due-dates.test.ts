import { describe, expect, it } from 'vitest'
import { addDays, monthGrid, monthOf, nextMonday, shiftMonth } from './todo-due-dates'

describe('todo due dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('picks next week’s Monday, a full week ahead when today is Monday', () => {
    expect(nextMonday('2026-10-15')).toBe('2026-10-19') // Thursday
    expect(nextMonday('2026-10-18')).toBe('2026-10-19') // Sunday
    expect(nextMonday('2026-10-19')).toBe('2026-10-26') // Monday
  })

  it('pages months across year ends', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
    expect(monthOf('2026-10-15')).toEqual({ year: 2026, month: 9 })
  })

  it('lays out six Sunday-first weeks around the month', () => {
    const grid = monthGrid({ year: 2026, month: 9 })
    expect(grid).toHaveLength(42)
    // October 2026 starts on a Thursday.
    expect(grid[0]).toEqual({ iso: '2026-09-27', inMonth: false })
    expect(grid[4]).toEqual({ iso: '2026-10-01', inMonth: true })
    expect(grid.filter((day) => day.inMonth)).toHaveLength(31)
    expect(grid[41]).toEqual({ iso: '2026-11-07', inMonth: false })
  })
})
