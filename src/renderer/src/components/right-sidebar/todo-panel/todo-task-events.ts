import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'
import { isRecord } from '../../../../../shared/detached-pages'
import { canDetachPages } from '../../detached-pages/detached-page-location'

/** Lets the sidebar panel and the calendar page show each other's writes without refetching. */
export type TodoTaskEvent =
  | { type: 'changed'; task: MicrosoftTodoTask }
  | { type: 'removed'; task: MicrosoftTodoTask }

type Listener = (event: TodoTaskEvent) => void

const listeners = new Map<Listener, symbol>()
// Events from another Orca window reach every view here.
const OTHER_WINDOW = Symbol('todo-other-window')
let bridgedToOtherWindows = false

function isTodoTaskEvent(value: unknown): value is TodoTaskEvent {
  if (!isRecord(value) || !isRecord(value.task)) {
    return false
  }
  const { type, task } = value
  return (
    (type === 'changed' || type === 'removed') &&
    typeof task.id === 'string' &&
    typeof task.listId === 'string'
  )
}

function deliver(source: symbol, event: TodoTaskEvent): void {
  for (const [listener, listenerSource] of listeners) {
    if (listenerSource !== source) {
      listener(event)
    }
  }
}

// Why: the calendar page can sit in its own window, a separate renderer from the sidebar panel.
function bridgeToOtherWindows(): void {
  if (bridgedToOtherWindows || !canDetachPages()) {
    return
  }
  bridgedToOtherWindows = true
  window.api.detachedPages.onBroadcast(({ topic, payload }) => {
    if (topic === 'todo-task' && isTodoTaskEvent(payload)) {
      deliver(OTHER_WINDOW, payload)
    }
  })
}

/** `source` keeps a view from re-applying its own event. */
export function subscribeTodoTaskEvents(source: symbol, listener: Listener): () => void {
  bridgeToOtherWindows()
  listeners.set(listener, source)
  return () => {
    listeners.delete(listener)
  }
}

export function publishTodoTaskEvent(source: symbol, event: TodoTaskEvent): void {
  deliver(source, event)
  if (canDetachPages()) {
    void window.api.detachedPages.broadcast('todo-task', event).catch(() => undefined)
  }
}
