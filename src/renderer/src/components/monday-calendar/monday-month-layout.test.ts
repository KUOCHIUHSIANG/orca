import { describe, expect, it } from 'vitest'
import type { DatedMondayItem } from '../../../../shared/monday-calendar-types'
import { buildMonthDays } from '../calendar/calendar-dates'
import { buildMonthLayout, layoutWeekSegments } from './monday-month-layout'

function item(id: string, startDate: string, endDate: string): DatedMondayItem {
  return {
    id,
    name: id,
    url: `https://example.monday.com/boards/1/pulses/${id}`,
    boardId: '1',
    boardName: 'Board',
    groupId: null,
    groupTitle: null,
    parentItemName: null,
    ownerIds: [],
    startDate,
    endDate,
    statusLabel: null,
    statusColor: null,
    isDone: false
  }
}

// Week of Sun 2026-10-11 .. Sat 2026-10-17.
const WEEK = buildMonthDays({ year: 2026, month: 9 })[2]

describe('layoutWeekSegments', () => {
  it('clips multi-week items and marks continuation', () => {
    const [segment] = layoutWeekSegments(WEEK, [item('long', '2026-10-08', '2026-10-20')])
    expect(segment).toMatchObject({
      startColumn: 0,
      span: 7,
      lane: 0,
      continuesBefore: true,
      continuesAfter: true
    })
  })

  it('stacks overlapping items and reuses free lanes', () => {
    const segments = layoutWeekSegments(WEEK, [
      item('short', '2026-10-12', '2026-10-12'),
      item('wide', '2026-10-12', '2026-10-14'),
      item('later', '2026-10-15', '2026-10-16'),
      item('outside', '2026-10-20', '2026-10-21')
    ])
    expect(
      segments.map((segment) => [segment.item.id, segment.startColumn, segment.span, segment.lane])
    ).toEqual([
      ['wide', 1, 3, 0],
      ['short', 1, 1, 1],
      ['later', 4, 2, 0]
    ])
  })
})

describe('buildMonthLayout', () => {
  it('leaves undated items off the grid', () => {
    const weeks = buildMonthLayout({ year: 2026, month: 9 }, [
      item('dated', '2026-10-13', '2026-10-13'),
      { ...item('undated', '2026-10-13', '2026-10-13'), startDate: null, endDate: null }
    ])
    expect(weeks.flatMap((week) => week.segments.map((segment) => segment.item.id))).toEqual([
      'dated'
    ])
  })
})
