import { describe, expect, it } from 'vitest'
import {
  mapMondayItem,
  mapMondayPeople,
  readDateRange,
  readSubitemBoardIds,
  toLocalCalendarDate
} from './monday-item-mapping'

const BOARD = { id: '382737576', name: 'Project Cases' }

function rawItem(columnValues: unknown[], extra: Record<string, unknown> = {}): unknown {
  return {
    id: '13189163479',
    name: '凌群AI網站 彈窗開發',
    url: 'https://autrontech.monday.com/boards/382737576/pulses/13189163479',
    group: { id: 'group_mm7gqfd3', title: '2026年10月維運項目' },
    parent_item: null,
    column_values: columnValues,
    ...extra
  }
}

const OWNERS = {
  id: 'person',
  type: 'people',
  column: { title: 'Owner' },
  persons_and_teams: [
    { id: '28766460', kind: 'person' },
    { id: '50798552', kind: 'person' },
    { id: '999', kind: 'team' }
  ]
}

const DONE_STATUS = {
  id: 'status8',
  type: 'status',
  column: { title: 'Status' },
  label: 'Done',
  is_done: true,
  label_style: { color: '#00c875' }
}

describe('mapMondayItem', () => {
  it('maps a timeline item with owners, status and link', () => {
    const item = mapMondayItem(
      rawItem([
        OWNERS,
        { id: 'date5', type: 'date', date: '2026-10-09', time: '' },
        DONE_STATUS,
        {
          id: 'timeline',
          type: 'timeline',
          from: '2026-10-05T00:00:00+00:00',
          to: '2026-10-06T00:00:00+00:00'
        },
        { id: 'status0', type: 'status', column: { title: 'Priority' }, label: 'High' }
      ]),
      BOARD
    )
    expect(item).toEqual({
      id: '13189163479',
      name: '凌群AI網站 彈窗開發',
      url: 'https://autrontech.monday.com/boards/382737576/pulses/13189163479',
      boardId: '382737576',
      boardName: 'Project Cases',
      groupId: 'group_mm7gqfd3',
      groupTitle: '2026年10月維運項目',
      parentItemName: null,
      ownerIds: ['28766460', '50798552'],
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      statusLabel: 'Done',
      statusColor: '#00c875',
      isDone: true
    })
  })

  it('falls back to a single due date and records the parent of a subitem', () => {
    const item = mapMondayItem(
      rawItem([{ id: 'date0', type: 'date', date: '2026-01-28', time: null }], {
        parent_item: { id: '1', name: 'Parent task', group: { id: 'this_week' } },
        group: { id: 'topics', title: 'Subitems' }
      }),
      BOARD
    )
    expect(item).toMatchObject({
      startDate: '2026-01-28',
      endDate: '2026-01-28',
      parentItemName: 'Parent task',
      // Why: subitems inherit the parent's group so a group-scoped board keeps them.
      groupId: 'this_week',
      groupTitle: null,
      statusLabel: null,
      isDone: false
    })
  })

  it('treats a "Done" label as done even when monday does not flag it', () => {
    const item = mapMondayItem(
      rawItem([
        { id: 'date0', type: 'date', date: '2026-01-28' },
        { id: 'status', type: 'status', column: { title: '狀態' }, label: 'Done', is_done: false }
      ]),
      BOARD
    )
    expect(item?.isDone).toBe(true)
  })

  it('prefers the Status column over another status-typed column', () => {
    const item = mapMondayItem(
      rawItem([
        { id: 'date0', type: 'date', date: '2026-01-28' },
        { id: 'priority', type: 'status', column: { title: 'Priority' }, label: 'Urgent' },
        { id: 'status', type: 'status', column: { title: 'Status' }, label: null }
      ]),
      BOARD
    )
    expect(item?.statusLabel).toBeNull()
  })

  it('keeps undated items with null dates', () => {
    expect(mapMondayItem(rawItem([OWNERS, DONE_STATUS]), BOARD)).toMatchObject({
      startDate: null,
      endDate: null,
      ownerIds: ['28766460', '50798552']
    })
  })

  it('skips malformed items', () => {
    expect(mapMondayItem({ id: '1', column_values: [] }, BOARD)).toBeNull()
  })
})

describe('readDateRange', () => {
  it('spans multiple date columns from earliest to latest', () => {
    expect(
      readDateRange([
        { type: 'date', date: '2026-10-09' },
        { type: 'date', date: '2026-10-02' }
      ])
    ).toEqual({ start: '2026-10-02', end: '2026-10-09' })
  })

  it('orders a reversed timeline', () => {
    expect(readDateRange([{ type: 'timeline', from: '2026-10-09', to: '2026-10-02' }])).toEqual({
      start: '2026-10-02',
      end: '2026-10-09'
    })
  })
})

describe('toLocalCalendarDate', () => {
  it('keeps a bare date as-is', () => {
    expect(toLocalCalendarDate('2026-10-09', null)).toBe('2026-10-09')
  })

  it('converts a UTC date-time to the local calendar day', () => {
    const instant = new Date('2026-10-09T23:30:00Z')
    const expected = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}`
    expect(toLocalCalendarDate('2026-10-09', '23:30:00')).toBe(expected)
  })
})

describe('readSubitemBoardIds', () => {
  it('reads board ids from subtasks column settings', () => {
    expect(
      readSubitemBoardIds([
        { settings_str: '{"boardIds":[534978985]}' },
        { settings_str: 'not json' },
        { settings_str: '{"boardIds":["534978985"]}' }
      ])
    ).toEqual(['534978985'])
  })
})

describe('mapMondayPeople', () => {
  it('keeps users with an id and name', () => {
    expect(mapMondayPeople([{ id: '50798552', name: 'Jater' }, { id: '1' }, null])).toEqual([
      { id: '50798552', name: 'Jater' }
    ])
  })
})
