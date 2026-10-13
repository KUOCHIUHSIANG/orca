// Why: To Do has no trash, so a delete waits out an undo window before it reaches Microsoft.
// Module scope keeps the timer alive if the panel unmounts during the window.
export const TODO_UNDO_WINDOW_MS = 8000

const pending = new Map<string, ReturnType<typeof setTimeout>>()

export function isTodoDeletePending(taskId: string): boolean {
  return pending.has(taskId)
}

export function scheduleTodoDelete(taskId: string, commit: () => void): void {
  cancelTodoDelete(taskId)
  pending.set(
    taskId,
    setTimeout(() => {
      pending.delete(taskId)
      commit()
    }, TODO_UNDO_WINDOW_MS)
  )
}

/** Returns true when a pending delete was cancelled in time. */
export function cancelTodoDelete(taskId: string): boolean {
  const timer = pending.get(taskId)
  if (timer === undefined) {
    return false
  }
  clearTimeout(timer)
  pending.delete(taskId)
  return true
}
