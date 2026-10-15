import type {
  MicrosoftTodoChecklistItem,
  MicrosoftTodoFailure,
  MicrosoftTodoList,
  MicrosoftTodoResult,
  MicrosoftTodoStatus,
  MicrosoftTodoTask
} from '../../shared/microsoft-todo-types'

export type MicrosoftTodoApi = {
  status: () => Promise<MicrosoftTodoStatus>
  setClientId: (args: {
    clientId: string
  }) => Promise<{ ok: true; status: MicrosoftTodoStatus } | MicrosoftTodoFailure>
  signIn: () => Promise<{ ok: true; status: MicrosoftTodoStatus } | MicrosoftTodoFailure>
  signOut: () => Promise<MicrosoftTodoStatus>
  fetchLists: () => Promise<MicrosoftTodoResult<{ lists: MicrosoftTodoList[] }>>
  fetchTasks: (args: {
    listId: string
  }) => Promise<MicrosoftTodoResult<{ tasks: MicrosoftTodoTask[] }>>
  fetchChecklist: (args: {
    listId: string
    taskId: string
  }) => Promise<MicrosoftTodoResult<{ items: MicrosoftTodoChecklistItem[] }>>
  createTask: (args: {
    listId: string
    title: string
    dueDate: string | null
    notes?: string
  }) => Promise<MicrosoftTodoResult<{ task: MicrosoftTodoTask }>>
  setTaskCompleted: (args: {
    listId: string
    taskId: string
    completed: boolean
  }) => Promise<MicrosoftTodoResult<{ task: MicrosoftTodoTask }>>
  updateTask: (args: {
    listId: string
    taskId: string
    changes: { title?: string; dueDate?: string | null; important?: boolean; notes?: string }
  }) => Promise<MicrosoftTodoResult<{ task: MicrosoftTodoTask }>>
  deleteTask: (args: { listId: string; taskId: string }) => Promise<MicrosoftTodoResult<object>>
  setChecklistItemChecked: (args: {
    listId: string
    taskId: string
    itemId: string
    checked: boolean
  }) => Promise<MicrosoftTodoResult<{ item: MicrosoftTodoChecklistItem }>>
  deleteChecklistItem: (args: {
    listId: string
    taskId: string
    itemId: string
  }) => Promise<MicrosoftTodoResult<object>>
  selectList: (args: { listId: string | null }) => Promise<void>
}
