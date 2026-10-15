import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
const { setMainHttpClient } = await import('../network/http-client')
setMainHttpClient({ fetch: (url, init) => fetchMock(url, init), proxySession: () => null })

const { createGraphRunner } = await import('./microsoft-graph-todo')
const { fetchTodoCalendar } = await import('./microsoft-graph-todo-calendar')

function task(id: string, status: string, due: string | null): Record<string, unknown> {
  return {
    id,
    title: id,
    status,
    ...(due ? { dueDateTime: { dateTime: `${due}T00:00:00.0000000`, timeZone: 'UTC' } } : {})
  }
}

/** First matching key wins, so list the more specific paths first. */
function respond(routes: Record<string, () => Response>): void {
  fetchMock.mockImplementation(async (url) => {
    const decoded = decodeURIComponent(url)
    const route = Object.keys(routes).find((key) => decoded.includes(key))
    if (!route) {
      throw new Error(`unexpected request ${decoded}`)
    }
    return routes[route]()
  })
}

const run = createGraphRunner(async () => 'token')

beforeEach(() => {
  fetchMock.mockReset()
})

describe('fetchTodoCalendar', () => {
  it('collects open tasks from every list and asks Graph to filter them', async () => {
    respond({
      "lists/work/tasks?$top=100&$filter=status ne 'completed'": () =>
        Response.json({ value: [task('report', 'notStarted', '2026-10-15')] }),
      "lists/shop/tasks?$top=100&$filter=status ne 'completed'": () =>
        Response.json({ value: [task('milk', 'notStarted', null)] }),
      '/me/todo/lists': () =>
        Response.json({
          value: [
            { id: 'work', displayName: 'Work', wellknownListName: 'defaultList' },
            { id: 'shop', displayName: 'Shopping' }
          ]
        })
    })
    const result = await fetchTodoCalendar(run, null)
    expect(result.lists.map((list) => list.id)).toEqual(['work', 'shop'])
    expect(result.tasks.map((item) => [item.listId, item.id])).toEqual([
      ['work', 'report'],
      ['shop', 'milk']
    ])
  })

  it('adds completed tasks due in range, filtering locally when Graph refuses the filter', async () => {
    respond({
      '/me/todo/lists/work/tasks?$top=100&$filter=status ne': () =>
        Response.json({ value: [task('open', 'notStarted', '2026-10-20')] }),
      '/me/todo/lists/work/tasks?$top=100&$filter=status eq': () =>
        Response.json({ error: { message: 'Invalid filter clause' } }, { status: 400 }),
      '/me/todo/lists/work/tasks?$top=100': () =>
        Response.json({
          value: [
            task('done-in-range', 'completed', '2026-10-12'),
            task('done-before', 'completed', '2026-10-01'),
            task('open', 'notStarted', '2026-10-20')
          ]
        }),
      '/me/todo/lists': () => Response.json({ value: [{ id: 'work', displayName: 'Work' }] })
    })
    const result = await fetchTodoCalendar(run, { from: '2026-10-11', to: '2026-10-18' })
    expect(result.tasks.map((item) => item.id)).toEqual(['open', 'done-in-range'])
  })

  it('does not hide a sign-in failure behind the filter fallback', async () => {
    respond({
      '/me/todo/lists/work/tasks': () => new Response(null, { status: 429 }),
      '/me/todo/lists': () => Response.json({ value: [{ id: 'work', displayName: 'Work' }] })
    })
    await expect(fetchTodoCalendar(run, null)).rejects.toMatchObject({ kind: 'rate-limited' })
  })
})
