import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
const { setMainHttpClient } = await import('../network/http-client')
setMainHttpClient({ fetch: (url, init) => fetchMock(url, init), proxySession: () => null })

const {
  createGraphRunner,
  deleteTodoTask,
  fetchTodoTasks,
  mapTodoTask,
  readNotes,
  toGraphDueDateTime,
  toLocalDueDate,
  updateTodoTask
} = await import('./microsoft-graph-todo')

beforeEach(() => {
  fetchMock.mockReset()
})

describe('due dates', () => {
  it('sends a due date as that calendar day at midnight', () => {
    expect(toGraphDueDateTime('2026-10-14')).toEqual({
      dateTime: '2026-10-14T00:00:00',
      timeZone: 'UTC'
    })
  })

  it('reads a due date as its date part without shifting time zones', () => {
    // Regression: converting UTC midnight to Taipei time used to show 10/14 tasks as 10/13.
    expect(toLocalDueDate({ dateTime: '2026-10-14T00:00:00.0000000', timeZone: 'UTC' })).toBe(
      '2026-10-14'
    )
    expect(
      toLocalDueDate({ dateTime: '2026-10-14T00:00:00.0000000', timeZone: 'Taipei Standard Time' })
    ).toBe('2026-10-14')
    expect(toLocalDueDate(null)).toBeNull()
  })
})

describe('mapTodoTask', () => {
  it('maps status, importance, and the To Do web link', () => {
    expect(
      mapTodoTask(
        {
          id: 'AAMk/1',
          title: 'Weekly report',
          status: 'completed',
          importance: 'high',
          completedDateTime: { dateTime: '2026-10-13T08:00:00.0000000', timeZone: 'UTC' }
        },
        'list-1'
      )
    ).toMatchObject({
      id: 'AAMk/1',
      listId: 'list-1',
      completed: true,
      important: true,
      dueDate: null,
      webUrl: 'https://to-do.live.com/tasks/id/AAMk%2F1/details'
    })
  })
})

describe('createGraphRunner', () => {
  it('refreshes the token once on 401 and retries', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ value: [] }))
    const getToken = vi.fn(async (force: boolean) => (force ? 'fresh' : 'stale'))
    const run = createGraphRunner(getToken)
    await expect(run('GET', '/me/todo/lists')).resolves.toEqual({ value: [] })
    expect(getToken).toHaveBeenNthCalledWith(2, true)
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer fresh' })
  })

  it('reports throttling as rate-limited', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: 'slow down' } }, { status: 429 }))
    const run = createGraphRunner(async () => 'token')
    await expect(run('GET', '/me/todo/lists')).rejects.toMatchObject({
      kind: 'rate-limited',
      message: 'slow down'
    })
  })
})

describe('fetchTodoTasks', () => {
  it('follows nextLink pages', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          value: [{ id: '1', title: 'a' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next'
        })
      )
      .mockResolvedValueOnce(Response.json({ value: [{ id: '2', title: 'b' }] }))
    const tasks = await fetchTodoTasks(
      createGraphRunner(async () => 'token'),
      'list-1'
    )
    expect(tasks.map((task) => task.id)).toEqual(['1', '2'])
    expect(fetchMock.mock.calls[1][0]).toBe('https://graph.microsoft.com/v1.0/next')
  })
})

describe('notes and reminders', () => {
  it('flattens HTML notes to text and drops empty ones', () => {
    expect(
      readNotes({ contentType: 'html', content: '<div>Oat&nbsp;milk<br>two &amp; more</div>' })
    ).toBe('Oat milk\ntwo & more')
    expect(readNotes({ contentType: 'text', content: '  ' })).toBeNull()
  })

  it('keeps an active reminder as a UTC instant', () => {
    expect(
      mapTodoTask(
        {
          id: '1',
          isReminderOn: true,
          reminderDateTime: { dateTime: '2026-10-14T01:30:00.0000000', timeZone: 'UTC' }
        },
        'list'
      )?.reminderAt
    ).toBe('2026-10-14T01:30:00Z')
    expect(mapTodoTask({ id: '1', isReminderOn: false }, 'list')?.reminderAt).toBeNull()
  })
})

describe('task edits', () => {
  it('patches only the changed fields, clearing a due date with null', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 't1', title: 'Renamed', importance: 'high' }))
    const run = createGraphRunner(async () => 'token')
    await updateTodoTask(run, {
      listId: 'l1',
      taskId: 't1',
      changes: { title: 'Renamed', dueDate: null, important: true, notes: 'note' }
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/todo/lists/l1/tasks/t1')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Renamed',
      dueDateTime: null,
      importance: 'high',
      body: { content: 'note', contentType: 'text' }
    })
  })

  it('deletes with DELETE and accepts an empty 204 reply', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await deleteTodoTask(
      createGraphRunner(async () => 'token'),
      { listId: 'l1', taskId: 't1' }
    )
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')
  })
})
