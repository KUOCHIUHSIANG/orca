import { readIpcErrorMessage } from '@/lib/ipc-error'
import type {
  MicrosoftTodoFailure,
  MicrosoftTodoTask
} from '../../../../../shared/microsoft-todo-types'
import { beginTodoTaskWrite } from './todo-task-write-order'

/** Ticks `base` at once and rolls back if Microsoft refuses; resolves to the failure, if any. */
export async function sendTodoCompletion(
  base: MicrosoftTodoTask,
  completed: boolean,
  replaceTask: (task: MicrosoftTodoTask) => void
): Promise<MicrosoftTodoFailure | null> {
  const isNewest = beginTodoTaskWrite(base.id)
  replaceTask({ ...base, completed, completedAt: completed ? new Date().toISOString() : null })
  const result = await window.api.microsoftTodo
    .setTaskCompleted({ listId: base.listId, taskId: base.id, completed })
    .catch((error: unknown): MicrosoftTodoFailure => ({
      ok: false,
      kind: 'api',
      message: readIpcErrorMessage(error) ?? ''
    }))
  const newest = isNewest()
  if (result.ok) {
    if (newest) {
      replaceTask(result.task)
    }
    return null
  }
  if (newest) {
    replaceTask(base)
  }
  return result
}
