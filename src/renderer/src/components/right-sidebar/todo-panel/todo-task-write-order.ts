// Why: overlapping writes to one task (save, then tick) can resolve out of order; only the
// newest may repaint the task, or an older response would undo a newer change on screen.
const newestWrite = new Map<string, number>()
let writeCount = 0

/** Starts a write; call the returned check once when it settles to learn if it is still the newest. */
export function beginTodoTaskWrite(taskId: string): () => boolean {
  const write = ++writeCount
  newestWrite.set(taskId, write)
  return () => {
    if (newestWrite.get(taskId) !== write) {
      return false
    }
    newestWrite.delete(taskId)
    return true
  }
}
