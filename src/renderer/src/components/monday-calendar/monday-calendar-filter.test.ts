import { describe, expect, it } from 'vitest'
import type { MondayCalendarItem } from '../../../../shared/monday-calendar-types'
import {
  effectiveBoardSelection,
  filterMondayItems,
  listMondayPeopleWithItems,
  ownerNamesForItem,
  recentWindowStart,
  toggleMondayBoardSelection
} from './monday-calendar-filter'

function item(
  id: string,
  ownerIds: string[],
  extra: Partial<MondayCalendarItem> = {}
): MondayCalendarItem {
  return {
    id,
    name: id,
    url: `https://example.monday.com/boards/1/pulses/${id}`,
    boardId: '1',
    boardName: 'Board',
    groupId: 'topics',
    groupTitle: null,
    parentItemName: null,
    ownerIds,
    startDate: '2026-10-13',
    endDate: '2026-10-13',
    statusLabel: extra.isDone ? 'Done' : null,
    statusColor: null,
    isDone: false,
    ...extra
  }
}

const ITEMS = [
  item('mine', ['jater']),
  item('shared', ['heather', 'jater'], { isDone: true }),
  item('other', ['omar'])
]

const NO_FILTERS = {
  selectedPersonIds: null,
  selectedBoardIds: null,
  boardSettings: {},
  today: '2026-10-13'
}

function ids(items: readonly MondayCalendarItem[]): string[] {
  return items.map((entry) => entry.id)
}

describe('filterMondayItems', () => {
  it('hides done items unless asked', () => {
    expect(ids(filterMondayItems(ITEMS, { ...NO_FILTERS, showDone: false }))).toEqual([
      'mine',
      'other'
    ])
    expect(filterMondayItems(ITEMS, { ...NO_FILTERS, showDone: true })).toHaveLength(3)
  })

  it('keeps items owned by any selected person', () => {
    expect(
      ids(filterMondayItems(ITEMS, { ...NO_FILTERS, selectedPersonIds: ['jater'], showDone: true }))
    ).toEqual(['mine', 'shared'])
  })

  it('keeps only the selected boards', () => {
    const items = [item('cases', []), item('weekly', [], { boardId: '2' })]
    expect(
      ids(filterMondayItems(items, { ...NO_FILTERS, selectedBoardIds: ['2'], showDone: true }))
    ).toEqual(['weekly'])
  })

  it('scopes a board to one group and can bypass the people filter', () => {
    const items = [
      item('cases', ['jater']),
      item('this-week', ['heather'], { boardId: '2', groupId: 'this_week' }),
      item('completed', ['heather'], { boardId: '2', groupId: 'completed' })
    ]
    const result = filterMondayItems(items, {
      ...NO_FILTERS,
      selectedPersonIds: ['jater'],
      boardSettings: {
        '2': {
          groupId: 'this_week',
          ignorePeopleFilter: true,
          includeDone: false,
          recentWeeks: null
        }
      },
      showDone: true
    })
    expect(ids(result)).toEqual(['cases', 'this-week'])
  })

  it('keeps a weekly-report board to recent weeks with its done tasks, others unchanged', () => {
    const report = (id: string, date: string | null): MondayCalendarItem =>
      item(id, ['heather'], { boardId: '2', isDone: true, startDate: date, endDate: date })
    const items = [
      item('cases-done', ['jater'], { isDone: true }),
      report('this-week', '2026-10-12'),
      report('last-week', '2026-10-05'),
      report('two-weeks-ago', '2026-10-02'),
      report('undated', null)
    ]
    const result = filterMondayItems(items, {
      ...NO_FILTERS,
      selectedPersonIds: ['jater'],
      boardSettings: {
        '2': { groupId: null, ignorePeopleFilter: true, includeDone: true, recentWeeks: 2 }
      },
      showDone: false
    })
    expect(ids(result)).toEqual(['this-week', 'last-week'])
  })
})

describe('recentWindowStart', () => {
  it('starts on the Sunday of the oldest week in the window', () => {
    // 2026-10-13 is a Tuesday; this week starts Sunday 10-11.
    expect(recentWindowStart('2026-10-13', 1)).toBe('2026-10-11')
    expect(recentWindowStart('2026-10-13', 2)).toBe('2026-10-04')
    expect(recentWindowStart('2026-10-11', 2)).toBe('2026-10-04')
  })
})

describe('toggleMondayBoardSelection', () => {
  const boards = ['1', '2', '3']

  it('unchecks one board out of "all"', () => {
    expect(toggleMondayBoardSelection(null, boards, '2')).toEqual(['1', '3'])
  })

  it('keeps several boards checked and returns to "all" once every board is checked', () => {
    expect(toggleMondayBoardSelection(['1'], boards, '2')).toEqual(['1', '2'])
    expect(toggleMondayBoardSelection(['1', '2'], boards, '3')).toBeNull()
  })

  it('refuses to uncheck the last checked board', () => {
    expect(toggleMondayBoardSelection(['2'], boards, '2')).toEqual(['2'])
  })
})

describe('effectiveBoardSelection', () => {
  it('falls back to every board when the selection no longer exists', () => {
    const boards = [
      { id: '1', name: 'Project Cases', groups: [] },
      { id: '2', name: "Jater's Task", groups: [] }
    ]
    expect(effectiveBoardSelection(['2', '9'], boards)).toEqual(['2'])
    expect(effectiveBoardSelection(['9'], boards)).toBeNull()
    expect(effectiveBoardSelection(null, boards)).toBeNull()
  })
})

describe('listMondayPeopleWithItems', () => {
  it('lists only people who own a task, sorted by name', () => {
    expect(
      listMondayPeopleWithItems({
        items: ITEMS,
        people: [
          { id: 'omar', name: 'Omar' },
          { id: 'nobody', name: 'Aaron' },
          { id: 'jater', name: 'Jater' },
          { id: 'heather', name: 'Heather' }
        ],
        boards: [],
        fetchedAt: 0
      }).map((person) => person.name)
    ).toEqual(['Heather', 'Jater', 'Omar'])
  })
})

describe('ownerNamesForItem', () => {
  const peopleById = new Map([
    ['heather', 'Heather'],
    ['jater', 'Jater']
  ])

  it('limits names to the selected people', () => {
    expect(ownerNamesForItem(ITEMS[1], peopleById, ['jater'])).toEqual(['Jater'])
    expect(ownerNamesForItem(ITEMS[1], peopleById, null)).toEqual(['Heather', 'Jater'])
  })
})
