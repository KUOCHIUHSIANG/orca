import { describe, expect, it } from 'vitest'
import type { MicrosoftTodoTask } from '../../../../shared/microsoft-todo-types'
import {
  calendarPeriod,
  overdueBeforePeriod,
  shiftAnchor,
  tasksByDay,
  undatedTodoTasks,
  visibleTodoTasks
} from './todo-calendar-model'

function task(id: string, fields: Partial<MicrosoftTodoTask> = {}): MicrosoftTodoTask {
  return {
    id,
    listId: 'work',
    title: id,
    completed: false,
    important: false,
    dueDate: null,
    completedAt: null,
    createdAt: null,
    notes: null,
    reminderAt: null,
    webUrl: '',
    ...fields
  }
}

describe('calendarPeriod', () => {
  it('shows the Sunday-first week around the anchor', () => {
    const period = calendarPeriod('week', '2026-10-15')
    expect(period.weeks).toHaveLength(1)
    expect(period.start).toBe('2026-10-11')
    expect(period.end).toBe('2026-10-18')
  })

  it('shows the whole month grid', () => {
    const period = calendarPeriod('month', '2026-10-15')
    expect(period.weeks).toHaveLength(5)
    expect(period.start).toBe('2026-09-27')
    expect(period.end).toBe('2026-11-01')
  })
})

describe('shiftAnchor', () => {
  it('steps weeks by seven days and months onto the 1st', () => {
    expect(shiftAnchor('week', '2026-10-15', 1)).toBe('2026-10-22')
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftAnchor('month', '2026-01-15', -1)).toBe('2025-12-01')
  })
})

describe('visible tasks', () => {
  const tasks = [
    task('open'),
    task('done', { completed: true }),
    task('settling', { completed: true }),
    task('shopping', { listId: 'shop' })
  ]

  it('drops completed tasks unless shown or settling, and honours the list filter', () => {
    const visible = visibleTodoTasks(tasks, {
      selectedListIds: ['work'],
      showCompleted: false,
      settlingIds: new Set(['settling'])
    })
    expect(visible.map((entry) => entry.id)).toEqual(['open', 'settling'])
  })

  it('shows every list when nothing is filtered', () => {
    const visible = visibleTodoTasks(tasks, {
      selectedListIds: null,
      showCompleted: true,
      settlingIds: new Set()
    })
    expect(visible).toHaveLength(4)
  })
})

describe('grouping', () => {
  it('puts important tasks first and completed ones last within a day', () => {
    const byDay = tasksByDay([
      task('b', { dueDate: '2026-10-15' }),
      task('done', { dueDate: '2026-10-15', completed: true, important: true }),
      task('a', { dueDate: '2026-10-15', important: true }),
      task('undated')
    ])
    expect(byDay.get('2026-10-15')?.map((entry) => entry.id)).toEqual(['a', 'b', 'done'])
    expect(byDay.size).toBe(1)
  })

  it('lists overdue tasks only while the period holds today', () => {
    const tasks = [
      task('late', { dueDate: '2026-10-02' }),
      task('earlier', { dueDate: '2026-09-30' }),
      task('this-week', { dueDate: '2026-10-12' }),
      task('late-done', { dueDate: '2026-10-01', completed: true })
    ]
    const thisWeek = calendarPeriod('week', '2026-10-15')
    expect(overdueBeforePeriod(tasks, thisWeek, '2026-10-15').map((entry) => entry.id)).toEqual([
      'earlier',
      'late'
    ])
    const nextWeek = calendarPeriod('week', '2026-10-22')
    expect(overdueBeforePeriod(tasks, nextWeek, '2026-10-15')).toEqual([])
  })

  it('collects open tasks without a due date', () => {
    const tasks = [
      task('someday'),
      task('done', { completed: true }),
      task('dated', { dueDate: '2026-10-15' })
    ]
    expect(undatedTodoTasks(tasks).map((entry) => entry.id)).toEqual(['someday'])
  })
})
