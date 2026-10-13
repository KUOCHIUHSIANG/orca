import { useCallback } from 'react'
import { toast } from 'sonner'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { translate } from '@/i18n/i18n'
import type {
  MicrosoftTodoFailure,
  MicrosoftTodoTask
} from '../../../../../shared/microsoft-todo-types'
import { describeTodoFailure } from './todo-failure-copy'
import { cancelTodoDelete, scheduleTodoDelete, TODO_UNDO_WINDOW_MS } from './todo-pending-deletes'
import type { TodoTaskChanges } from './todo-task-edits'
import { beginTodoTaskWrite } from './todo-task-write-order'
import type { MicrosoftTodoController } from './use-microsoft-todo'

function ipcFailure(error: unknown): MicrosoftTodoFailure {
  return { ok: false, kind: 'api', message: readIpcErrorMessage(error) ?? '' }
}

function applyChanges(task: MicrosoftTodoTask, changes: TodoTaskChanges): MicrosoftTodoTask {
  return {
    ...task,
    ...(changes.title !== undefined ? { title: changes.title } : {}),
    ...(changes.dueDate !== undefined ? { dueDate: changes.dueDate } : {}),
    ...(changes.important !== undefined ? { important: changes.important } : {}),
    ...(changes.notes !== undefined ? { notes: changes.notes.trim() || null } : {})
  }
}

export function useTodoTaskMutations(todo: MicrosoftTodoController): {
  updateTask: (task: MicrosoftTodoTask, changes: TodoTaskChanges) => void
  deleteTask: (task: MicrosoftTodoTask) => void
} {
  const { replaceTask, removeTask, reportError } = todo

  const updateTask = useCallback(
    (task: MicrosoftTodoTask, changes: TodoTaskChanges): void => {
      // Why: show the edit at once; put the old values back if Microsoft refuses it.
      const isNewest = beginTodoTaskWrite(task.id)
      replaceTask(applyChanges(task, changes))
      void window.api.microsoftTodo
        .updateTask({ listId: task.listId, taskId: task.id, changes })
        .catch(ipcFailure)
        .then((result) => {
          const newest = isNewest()
          if (result.ok) {
            if (newest) {
              replaceTask(result.task)
            }
          } else {
            if (newest) {
              replaceTask(task)
            }
            reportError(result)
          }
        })
    },
    [replaceTask, reportError]
  )

  const deleteTask = useCallback(
    (task: MicrosoftTodoTask): void => {
      removeTask(task)
      scheduleTodoDelete(task.id, () => {
        void window.api.microsoftTodo
          .deleteTask({ listId: task.listId, taskId: task.id })
          .catch(ipcFailure)
          .then((result) => {
            if (!result.ok) {
              replaceTask(task)
              toast.error(describeTodoFailure(result))
            }
          })
      })
      toast(
        translate('auto.components.todoPanel.delete.toast', 'Deleted “{{value0}}”', {
          value0: task.title
        }),
        {
          duration: TODO_UNDO_WINDOW_MS,
          action: {
            label: translate('auto.components.todoPanel.delete.undo', 'Undo'),
            onClick: () => {
              if (cancelTodoDelete(task.id)) {
                replaceTask(task)
              }
            }
          }
        }
      )
    },
    [removeTask, replaceTask]
  )

  return { updateTask, deleteTask }
}
