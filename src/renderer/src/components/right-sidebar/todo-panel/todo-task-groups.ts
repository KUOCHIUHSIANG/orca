import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'

export type TodoTaskGroupKey = 'overdue' | 'today' | 'upcoming' | 'no-date'

export type TodoTaskGroups = {
  open: { key: TodoTaskGroupKey; tasks: MicrosoftTodoTask[] }[]
  completed: MicrosoftTodoTask[]
}

const COMPLETED_LIMIT = 30

function groupKey(task: MicrosoftTodoTask, today: string): TodoTaskGroupKey {
  if (!task.dueDate) {
    return 'no-date'
  }
  if (task.dueDate < today) {
    return 'overdue'
  }
  return task.dueDate === today ? 'today' : 'upcoming'
}

function byImportanceThenDue(a: MicrosoftTodoTask, b: MicrosoftTodoTask): number {
  if (a.important !== b.important) {
    return a.important ? -1 : 1
  }
  return (
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
    (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  )
}

/** Open tasks bucketed by due date (empty buckets dropped); recent completions listed separately.
 *  `holdOpen` keeps just-ticked tasks in place until their completion animation ends. */
export function groupTodoTasks(
  tasks: readonly MicrosoftTodoTask[],
  today: string,
  holdOpen: ReadonlySet<string> = new Set()
): TodoTaskGroups {
  const isOpen = (task: MicrosoftTodoTask): boolean => !task.completed || holdOpen.has(task.id)
  const order: TodoTaskGroupKey[] = ['overdue', 'today', 'upcoming', 'no-date']
  const open = order
    .map((key) => ({
      key,
      tasks: tasks
        .filter((task) => isOpen(task) && groupKey(task, today) === key)
        .sort(byImportanceThenDue)
    }))
    .filter((group) => group.tasks.length > 0)
  const completed = tasks
    .filter((task) => !isOpen(task))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, COMPLETED_LIMIT)
  return { open, completed }
}
