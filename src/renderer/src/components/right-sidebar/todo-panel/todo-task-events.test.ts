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
})
