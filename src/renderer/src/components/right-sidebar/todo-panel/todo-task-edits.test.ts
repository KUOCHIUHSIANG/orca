import { describe, expect, it } from 'vitest'
import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'
import { hasTodoChanges, pendingTodoChanges } from './todo-task-edits'

const saved: MicrosoftTodoTask = {
  id: 'task',
  listId: 'list',
  title: 'Write report',
  completed: false,
  important: false,
  dueDate: '2026-10-14',
  completedAt: null,
  createdAt: null,
  notes: 'Draft in docs',
  reminderAt: null,
  webUrl: 'https://to-do.live.com/tasks/id/task/details'
}

describe('pendingTodoChanges', () => {
  it('keeps only edits that differ from the saved task', () => {
    const changes = pendingTodoChanges(saved, {
      title: 'Write report',
      dueDate: '2026-10-15',
      important: false,
      notes: '  Draft in docs  '
    })
    expect(changes).toEqual({ dueDate: '2026-10-15' })
    expect(hasTodoChanges(changes)).toBe(true)
  })

  it('treats a cleared due date as a change but ignores a blank title', () => {
    expect(pendingTodoChanges(saved, { dueDate: null, title: '   ' })).toEqual({ dueDate: null })
  })

  it('trims the title and reports nothing when the draft matches', () => {
    expect(pendingTodoChanges(saved, { title: '  Ship report ' })).toEqual({ title: 'Ship report' })
    expect(hasTodoChanges(pendingTodoChanges(saved, {}))).toBe(false)
  })
})
