import type { MicrosoftTodoList, MicrosoftTodoTask } from '../../shared/microsoft-todo-types'
import { MicrosoftTodoError } from './microsoft-todo-auth'
import { collectPages, fetchTodoLists, mapTodoTask, type GraphRunner } from './microsoft-graph-todo'

const LIST_CONCURRENCY = 4

/** Local calendar days [from, to) whose completed tasks the calendar shows. */
export type TodoCompletedRange = { from: string; to: string }

function listTasksPath(listId: string, filter?: string): string {
  const base = `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100`
  return filter ? `${base}&$filter=${encodeURIComponent(filter)}` : base
}

async function fetchListTasks(
  run: GraphRunner,
  listId: string,
  filter: string,
  keep: (task: MicrosoftTodoTask) => boolean
): Promise<MicrosoftTodoTask[]> {
  let rows: unknown[]
  try {
    rows = await collectPages(run, listTasksPath(listId, filter))
  } catch (error) {
    // Why: should Graph refuse the filter, the whole list still answers and `keep` applies it here.
    if (!(error instanceof MicrosoftTodoError) || error.kind !== 'api') {
      throw error
    }
    rows = await collectPages(run, listTasksPath(listId))
  }
  return rows
    .map((row) => mapTodoTask(row, listId))
    .filter((task): task is MicrosoftTodoTask => task !== null && keep(task))
}

/** Every list's open tasks, plus completed tasks due inside `completedRange` when asked for. */
export async function fetchTodoCalendar(
  run: GraphRunner,
  completedRange: TodoCompletedRange | null
): Promise<{ lists: MicrosoftTodoList[]; tasks: MicrosoftTodoTask[] }> {
  const lists = await fetchTodoLists(run)
  const tasks: MicrosoftTodoTask[] = []
  for (let start = 0; start < lists.length; start += LIST_CONCURRENCY) {
    const batch = await Promise.all(
      lists.slice(start, start + LIST_CONCURRENCY).map(async (list) => {
        const open = await fetchListTasks(
          run,
          list.id,
          "status ne 'completed'",
          (task) => !task.completed
        )
        if (!completedRange) {
          return open
        }
        const { from, to } = completedRange
        const done = await fetchListTasks(
          run,
          list.id,
          `status eq 'completed' and dueDateTime/dateTime ge '${from}T00:00:00' and dueDateTime/dateTime lt '${to}T00:00:00'`,
          (task) =>
            task.completed && task.dueDate !== null && task.dueDate >= from && task.dueDate < to
        )
        return [...open, ...done]
      })
    )
    tasks.push(...batch.flat())
  }
  return { lists, tasks }
}
