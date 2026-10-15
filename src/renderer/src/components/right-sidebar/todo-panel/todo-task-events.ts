import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'

/** Lets the sidebar panel and the calendar page show each other's writes without refetching. */
export type TodoTaskEvent =
  | { type: 'changed'; task: MicrosoftTodoTask }
  | { type: 'removed'; task: MicrosoftTodoTask }

type Listener = (event: TodoTaskEvent) => void

const listeners = new Map<Listener, symbol>()

/** `source` keeps a view from re-applying its own event. */
export function subscribeTodoTaskEvents(source: symbol, listener: Listener): () => void {
  listeners.set(listener, source)
  return () => {
    listeners.delete(listener)
  }
}

export function publishTodoTaskEvent(source: symbol, event: TodoTaskEvent): void {
  for (const [listener, listenerSource] of listeners) {
    if (listenerSource !== source) {
      listener(event)
    }
  }
}
