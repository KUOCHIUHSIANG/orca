import { describe, expect, it } from 'vitest'
import { monthGrid, nextMonday } from './todo-due-dates'

describe('todo due dates', () => {
  it('picks next week’s Monday, a full week ahead when today is Monday', () => {
    expect(nextMonday('2026-10-15')).toBe('2026-10-19') // Thursday
    expect(nextMonday('2026-10-18')).toBe('2026-10-19') // Sunday
    expect(nextMonday('2026-10-19')).toBe('2026-10-26') // Monday
  })

  it('pads the picker month to six Sunday-first weeks', () => {
    const grid = monthGrid({ year: 2026, month: 9 })
    expect(grid).toHaveLength(42)
    // October 2026 starts on a Thursday and needs only five weeks.
    expect(grid[0]).toEqual({ iso: '2026-09-27', inMonth: false })
    expect(grid[4]).toEqual({ iso: '2026-10-01', inMonth: true })
    expect(grid.filter((day) => day.inMonth)).toHaveLength(31)
    expect(grid[41]).toEqual({ iso: '2026-11-07', inMonth: false })
  })
})
