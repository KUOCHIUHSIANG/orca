import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'

/** Fields the user edited or wants saved; `dueDate: null` clears the date, undefined leaves it. */
export type TodoTaskChanges = {
  title?: string
  dueDate?: string | null
  important?: boolean
  notes?: string
}

/** The edits that differ from the saved task; a blank title keeps the saved one since To Do requires it. */
export function pendingTodoChanges(
  task: MicrosoftTodoTask,
  edits: TodoTaskChanges
): TodoTaskChanges {
  const changes: TodoTaskChanges = {}
  const title = edits.title?.trim()
  if (title && title !== task.title) {
    changes.title = title
  }
  if (edits.dueDate !== undefined && edits.dueDate !== task.dueDate) {
    changes.dueDate = edits.dueDate
  }
  if (edits.important !== undefined && edits.important !== task.important) {
    changes.important = edits.important
  }
  if (edits.notes !== undefined && edits.notes.trim() !== (task.notes ?? '').trim()) {
    changes.notes = edits.notes
  }
  return changes
}

export function hasTodoChanges(changes: TodoTaskChanges): boolean {
  return Object.keys(changes).length > 0
}
