import {
  addDays,
  buildMonthDays,
  buildWeekDays,
  monthCursorOfIso,
  shiftMonth,
  weekStartOf
} from '@/components/calendar/calendar-dates'
import type { MicrosoftTodoTask } from '../../../../shared/microsoft-todo-types'

export type TodoCalendarView = 'week' | 'month'

/** Weeks on screen and the `[start, end)` day range they cover. */
export type TodoCalendarPeriod = { weeks: string[][]; start: string; end: string }

export function calendarPeriod(view: TodoCalendarView, anchor: string): TodoCalendarPeriod {
  const weeks =
    view === 'week'
      ? [buildWeekDays(weekStartOf(anchor))]
      : buildMonthDays(monthCursorOfIso(anchor))
  const last = weeks.at(-1)?.at(-1) ?? anchor
  return { weeks, start: weeks[0][0], end: addDays(last, 1) }
}

/** Moves the anchor a whole week or month; month steps land on the 1st so short months can't skip. */
export function shiftAnchor(view: TodoCalendarView, anchor: string, delta: number): string {
  if (view === 'week') {
    return addDays(anchor, delta * 7)
  }
  const month = shiftMonth(monthCursorOfIso(anchor), delta)
  return `${month.year}-${String(month.month + 1).padStart(2, '0')}-01`
}

export function compareTodoTasks(a: MicrosoftTodoTask, b: MicrosoftTodoTask): number {
  if (a.completed !== b.completed) {
    return a.completed ? 1 : -1
  }
  if (a.important !== b.important) {
    return a.important ? -1 : 1
  }
  return a.title.localeCompare(b.title)
}

/** Tasks in the selected lists; completed ones only when shown or still settling after a tick. */
export function visibleTodoTasks(
  tasks: readonly MicrosoftTodoTask[],
  options: {
    selectedListIds: readonly string[] | null
    showCompleted: boolean
    settlingIds: ReadonlySet<string>
  }
): MicrosoftTodoTask[] {
  const { selectedListIds } = options
  return tasks.filter(
    (task) =>
      (!selectedListIds || selectedListIds.includes(task.listId)) &&
      (!task.completed || options.showCompleted || options.settlingIds.has(task.id))
  )
}

export function tasksByDay(tasks: readonly MicrosoftTodoTask[]): Map<string, MicrosoftTodoTask[]> {
  const byDay = new Map<string, MicrosoftTodoTask[]>()
  for (const task of tasks) {
    if (task.dueDate) {
      byDay.set(task.dueDate, [...(byDay.get(task.dueDate) ?? []), task])
    }
  }
  for (const dayTasks of byDay.values()) {
    dayTasks.sort(compareTodoTasks)
  }
  return byDay
}

/** Open tasks due before the period, shown only while the period contains today. */
export function overdueBeforePeriod(
  tasks: readonly MicrosoftTodoTask[],
  period: TodoCalendarPeriod,
  today: string
): MicrosoftTodoTask[] {
  if (today < period.start || today >= period.end) {
    return []
  }
  return tasks
    .filter((task) => !task.completed && task.dueDate !== null && task.dueDate < period.start)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || compareTodoTasks(a, b))
}

export function undatedTodoTasks(tasks: readonly MicrosoftTodoTask[]): MicrosoftTodoTask[] {
  return tasks.filter((task) => task.dueDate === null && !task.completed).sort(compareTodoTasks)
}
