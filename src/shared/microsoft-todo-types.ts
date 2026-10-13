export type MicrosoftTodoList = {
  id: string
  name: string
  /** 'defaultList' marks the account's built-in Tasks list. */
  wellKnownName: string | null
}

export type MicrosoftTodoTask = {
  id: string
  listId: string
  title: string
  completed: boolean
  important: boolean
  /** Local calendar date YYYY-MM-DD, or null when the task has no due date. */
  dueDate: string | null
  completedAt: string | null
  createdAt: string | null
  /** Plain-text notes; null when empty. */
  notes: string | null
  /** UTC ISO instant of an active reminder, or null. */
  reminderAt: string | null
  /** Opens the task in the To Do web app. */
  webUrl: string
}

/** A To Do "step" under a task; loaded on demand when the task is expanded. */
export type MicrosoftTodoChecklistItem = {
  id: string
  title: string
  checked: boolean
}

export type MicrosoftTodoStatus = {
  clientIdConfigured: boolean
  signedIn: boolean
  accountName: string | null
  selectedListId: string | null
}

export type MicrosoftTodoErrorKind =
  | 'not-configured'
  | 'signed-out'
  | 'cancelled'
  | 'rate-limited'
  | 'network'
  | 'api'

export type MicrosoftTodoFailure = { ok: false; kind: MicrosoftTodoErrorKind; message: string }

export type MicrosoftTodoResult<T> = ({ ok: true } & T) | MicrosoftTodoFailure
