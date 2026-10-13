import { describe, expect, it } from 'vitest'
import { fetchMondayCalendarSnapshot } from './monday-calendar-fetch'
import type { MondayQueryRunner } from './monday-graphql-client'

function datedItem(id: string, date: string): Record<string, unknown> {
  return {
    id,
    name: `Task ${id}`,
    url: `https://example.monday.com/boards/1/pulses/${id}`,
    column_values: [
      { type: 'people', persons_and_teams: [{ id: '50798552', kind: 'person' }] },
      { type: 'date', date }
    ]
  }
}

function recordingRunner(responses: Record<string, unknown>[]): {
  run: MondayQueryRunner
  calls: { query: string; variables: Record<string, unknown> }[]
} {
  const calls: { query: string; variables: Record<string, unknown> }[] = []
  const run: MondayQueryRunner = async (query, variables) => {
    calls.push({ query, variables })
    const next = responses.shift()
    if (!next) {
      throw new Error('unexpected request')
    }
    return next
  }
  return { run, calls }
}

describe('fetchMondayCalendarSnapshot', () => {
  it('pages through boards, then reads the subitem board once', async () => {
    const { run, calls } = recordingRunner([
      {
        boards: [
          {
            id: '1',
            name: 'Project Cases',
            groups: [{ id: 'topics', title: 'Tasks' }, { id: 'broken' }],
            columns: [{ settings_str: '{"boardIds":[2]}' }],
            items_page: { cursor: 'page-2', items: [datedItem('a', '2026-10-01')] }
          }
        ],
        users: [{ id: '50798552', name: 'Jater' }]
      },
      { next_items_page: { cursor: null, items: [datedItem('b', '2026-10-02')] } },
      {
        boards: [
          {
            id: '2',
            name: 'Subitems of Project Cases',
            columns: [],
            items_page: { cursor: null, items: [datedItem('c', '2026-10-03')] }
          }
        ]
      }
    ])

    const snapshot = await fetchMondayCalendarSnapshot(run, ['1'], () => 42)

    // Why: subitems file under the subscribed board so the board filter keeps them together.
    expect(snapshot.items.map((item) => [item.id, item.boardId, item.boardName])).toEqual([
      ['a', '1', 'Project Cases'],
      ['b', '1', 'Project Cases'],
      ['c', '1', 'Project Cases']
    ])
    expect(snapshot.boards).toEqual([
      { id: '1', name: 'Project Cases', groups: [{ id: 'topics', title: 'Tasks' }] }
    ])
    expect(snapshot.people).toEqual([{ id: '50798552', name: 'Jater' }])
    expect(snapshot.fetchedAt).toBe(42)
    expect(calls).toHaveLength(3)
    expect(calls[0].query).toContain('users(limit: 1000)')
    expect(calls[1].variables).toEqual({ cursor: 'page-2', limit: 500 })
    expect(calls[2].variables).toEqual({ boardIds: ['2'], limit: 500 })
    expect(calls[2].query).not.toContain('users(')
    expect(calls.every((call) => call.query.trimStart().startsWith('query'))).toBe(true)
  })

  it('does not refetch a subitem board that is already configured', async () => {
    const { run, calls } = recordingRunner([
      {
        boards: [
          {
            id: '1',
            name: 'Main',
            columns: [{ settings_str: '{"boardIds":[2]}' }],
            items_page: { cursor: null, items: [] }
          },
          { id: '2', name: 'Subitems', columns: [], items_page: { cursor: null, items: [] } }
        ],
        users: []
      }
    ])
    await fetchMondayCalendarSnapshot(run, ['1', '2'])
    expect(calls).toHaveLength(1)
  })
})

describe('fetchMondayCalendarSnapshot without boards', () => {
  it('does not query monday when only docs are subscribed', async () => {
    const { run, calls } = recordingRunner([])
    const snapshot = await fetchMondayCalendarSnapshot(run, [], () => 7)
    expect(snapshot).toEqual({ items: [], people: [], boards: [], fetchedAt: 7 })
    expect(calls).toHaveLength(0)
  })
})
