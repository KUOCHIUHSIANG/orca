import { describe, expect, it } from 'vitest'
import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'
import { groupTodoTasks } from './todo-task-groups'

function task(id: string, extra: Partial<MicrosoftTodoTask> = {}): MicrosoftTodoTask {
  return {
    id,
    listId: 'list',
    title: id,
    completed: false,
    important: false,
    dueDate: null,
    completedAt: null,
    createdAt: null,
    notes: null,
    reminderAt: null,
    webUrl: `https://to-do.live.com/tasks/id/${id}/details`,
    ...extra
  }
}

describe('groupTodoTasks', () => {
  it('buckets open tasks by due date and drops empty buckets', () => {
    const groups = groupTodoTasks(
      [
        task('late', { dueDate: '2026-10-10' }),
        task('now', { dueDate: '2026-10-14' }),
        task('later', { dueDate: '2026-10-20' }),
        task('someday'),
        task('done', { completed: true, completedAt: '2026-10-13T08:00:00' })
      ],
      '2026-10-14'
    )
    expect(groups.open.map((group) => [group.key, group.tasks.map((t) => t.id)])).toEqual([
      ['overdue', ['late']],
      ['today', ['now']],
      ['upcoming', ['later']],
      ['no-date', ['someday']]
    ])
    expect(groups.completed.map((t) => t.id)).toEqual(['done'])
  })

  it('puts important tasks first, then earlier due dates', () => {
    const groups = groupTodoTasks(
      [
        task('b', { dueDate: '2026-10-21' }),
        task('a', { dueDate: '2026-10-20' }),
        task('star', { dueDate: '2026-10-25', important: true })
      ],
      '2026-10-14'
    )
    expect(groups.open[0].tasks.map((t) => t.id)).toEqual(['star', 'a', 'b'])
  })

  it('lists the most recently completed first', () => {
    const groups = groupTodoTasks(
      [
        task('old', { completed: true, completedAt: '2026-10-01T00:00:00' }),
        task('new', { completed: true, completedAt: '2026-10-13T00:00:00' })
      ],
      '2026-10-14'
    )
    expect(groups.completed.map((t) => t.id)).toEqual(['new', 'old'])
  })

  it('keeps a held task in its open group until its completion animation ends', () => {
    const ticked = task('ticked', { dueDate: '2026-10-14', completed: true })
    expect(groupTodoTasks([ticked], '2026-10-14', new Set(['ticked'])).open).toEqual([
      { key: 'today', tasks: [ticked] }
    ])
    const settled = groupTodoTasks([ticked], '2026-10-14')
    expect(settled.open).toEqual([])
    expect(settled.completed).toEqual([ticked])
  })
})
