import { describe, expect, it, vi } from 'vitest'
import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'
import { publishTodoTaskEvent, subscribeTodoTaskEvents } from './todo-task-events'

const task: MicrosoftTodoTask = {
  id: 't1',
  listId: 'l1',
  title: 'Report',
  completed: false,
  important: false,
  dueDate: null,
  completedAt: null,
  createdAt: null,
  notes: null,
  reminderAt: null,
  webUrl: ''
}

describe('todo task events', () => {
  it('reaches other views but not the one that published', () => {
    const panel = Symbol('panel')
    const calendar = Symbol('calendar')
    const panelListener = vi.fn()
    const calendarListener = vi.fn()
    const stopPanel = subscribeTodoTaskEvents(panel, panelListener)
    const stopCalendar = subscribeTodoTaskEvents(calendar, calendarListener)

    publishTodoTaskEvent(calendar, { type: 'changed', task })
    expect(panelListener).toHaveBeenCalledWith({ type: 'changed', task })
    expect(calendarListener).not.toHaveBeenCalled()

    stopPanel()
    publishTodoTaskEvent(calendar, { type: 'removed', task })
    expect(panelListener).toHaveBeenCalledTimes(1)
    stopCalendar()
  })

  it('carries writes to and from views in another Orca window', () => {
    let fromOtherWindow: ((message: { topic: string; payload: unknown }) => void) | null = null
    const broadcast = vi.fn(() => Promise.resolve())
    vi.stubGlobal('window', {
      location: { pathname: '/index.html' },
      api: {
        detachedPages: {
          broadcast,
          onBroadcast: (callback: typeof fromOtherWindow) => {
            fromOtherWindow = callback
            return () => {}
          }
        }
      }
    })
    const panel = Symbol('panel')
    const listener = vi.fn()
    const stop = subscribeTodoTaskEvents(panel, listener)

    publishTodoTaskEvent(panel, { type: 'changed', task })
    expect(broadcast).toHaveBeenCalledWith('todo-task', { type: 'changed', task })
    expect(listener).not.toHaveBeenCalled()

    fromOtherWindow!({ topic: 'todo-task', payload: { type: 'removed', task } })
    fromOtherWindow!({ topic: 'todo-task', payload: { type: 'removed', task: { id: 7 } } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ type: 'removed', task })

    stop()
    vi.unstubAllGlobals()
  })
})
