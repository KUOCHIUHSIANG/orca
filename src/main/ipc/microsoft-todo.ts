import { ipcMain } from 'electron'
import {
  MicrosoftTodoError,
  refreshMicrosoftTokens,
  signInWithMicrosoft
} from '../microsoft-todo/microsoft-todo-auth'
import {
  createGraphRunner,
  createTodoTask,
  fetchAccountName,
  fetchTodoLists,
  fetchTodoTasks,
  deleteTodoTask,
  setTodoTaskCompleted,
  updateTodoTask,
  type TodoTaskChanges,
  type GraphRunner
} from '../microsoft-todo/microsoft-graph-todo'
import {
  deleteTodoChecklistItem,
  fetchTodoChecklist,
  setTodoChecklistItemChecked
} from '../microsoft-todo/microsoft-graph-todo-checklist'
import {
  clearMicrosoftTokens,
  getMicrosoftTodoClientId,
  getMicrosoftTodoStatus,
  loadMicrosoftTokens,
  saveMicrosoftTokens,
  setMicrosoftTodoAccount,
  setMicrosoftTodoClientId,
  setMicrosoftTodoSelectedList
} from '../microsoft-todo/microsoft-todo-store'
import type { MicrosoftTodoFailure } from '../../shared/microsoft-todo-types'

const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_TITLE_LENGTH = 255

let inFlightRefresh: Promise<string> | null = null

function toFailure(error: unknown): MicrosoftTodoFailure {
  if (error instanceof MicrosoftTodoError) {
    if (error.kind === 'signed-out') {
      // Why: a dead refresh token never recovers; drop it so the panel asks to sign in again.
      clearMicrosoftTokens()
    }
    return { ok: false, kind: error.kind, message: error.message }
  }
  return { ok: false, kind: 'api', message: error instanceof Error ? error.message : String(error) }
}

async function getAccessToken(forceRefresh: boolean): Promise<string> {
  const clientId = getMicrosoftTodoClientId()
  const tokens = loadMicrosoftTokens()
  if (!clientId) {
    throw new MicrosoftTodoError('not-configured', 'Microsoft app client ID is not set.')
  }
  if (!tokens) {
    throw new MicrosoftTodoError('signed-out', 'Sign in to Microsoft first.')
  }
  if (!forceRefresh && Date.now() < tokens.expiresAt) {
    return tokens.accessToken
  }
  // Why: refresh tokens rotate, so concurrent refreshes must share one exchange.
  inFlightRefresh ??= refreshMicrosoftTokens(clientId, tokens.refreshToken)
    .then((next) => {
      saveMicrosoftTokens(next)
      return next.accessToken
    })
    .finally(() => {
      inFlightRefresh = null
    })
  return inFlightRefresh
}

function readRecord(args: unknown): Record<string, unknown> {
  return typeof args === 'object' && args !== null ? { ...args } : {}
}

function readId(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 && value.length < 512 ? value : null
}

const MAX_NOTES_LENGTH = 20_000

/** Keeps only well-formed edits; undefined means "leave unchanged". */
function readChanges(value: unknown): TodoTaskChanges | null {
  const record = readRecord(value)
  const changes: TodoTaskChanges = {}
  if (typeof record.title === 'string') {
    const title = record.title.trim()
    if (!title || title.length > MAX_TITLE_LENGTH) {
      return null
    }
    changes.title = title
  }
  if (
    record.dueDate === null ||
    (typeof record.dueDate === 'string' && DATE_PATTERN.test(record.dueDate))
  ) {
    changes.dueDate = record.dueDate
  }
  if (typeof record.important === 'boolean') {
    changes.important = record.important
  }
  if (typeof record.notes === 'string' && record.notes.length <= MAX_NOTES_LENGTH) {
    changes.notes = record.notes
  }
  return Object.keys(changes).length > 0 ? changes : null
}

async function withGraph<T extends Record<string, unknown>>(
  work: (run: GraphRunner) => Promise<T>
): Promise<({ ok: true } & T) | MicrosoftTodoFailure> {
  try {
    return { ok: true, ...(await work(createGraphRunner(getAccessToken))) }
  } catch (error) {
    return toFailure(error)
  }
}

export function registerMicrosoftTodoHandlers(): void {
  ipcMain.handle('todo:status', () => getMicrosoftTodoStatus())

  ipcMain.handle('todo:setClientId', (_event, args: unknown) => {
    const clientId = readId(readRecord(args), 'clientId')?.trim() ?? ''
    if (!CLIENT_ID_PATTERN.test(clientId)) {
      return { ok: false, kind: 'not-configured', message: 'invalid-client-id' }
    }
    setMicrosoftTodoClientId(clientId)
    return { ok: true, status: getMicrosoftTodoStatus() }
  })

  ipcMain.handle('todo:signIn', async () => {
    const clientId = getMicrosoftTodoClientId()
    if (!clientId) {
      return { ok: false, kind: 'not-configured', message: '' }
    }
    try {
      saveMicrosoftTokens(await signInWithMicrosoft(clientId))
      const accountName = await fetchAccountName(createGraphRunner(getAccessToken)).catch(
        () => null
      )
      setMicrosoftTodoAccount(accountName)
      return { ok: true, status: getMicrosoftTodoStatus() }
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle('todo:signOut', () => {
    clearMicrosoftTokens()
    setMicrosoftTodoAccount(null)
    return getMicrosoftTodoStatus()
  })

  ipcMain.handle('todo:fetchLists', () =>
    withGraph(async (run) => ({ lists: await fetchTodoLists(run) }))
  )

  ipcMain.handle('todo:fetchTasks', (_event, args: unknown) => {
    const listId = readId(readRecord(args), 'listId')
    if (!listId) {
      return { ok: false, kind: 'api', message: 'Missing list id.' }
    }
    return withGraph(async (run) => ({ tasks: await fetchTodoTasks(run, listId) }))
  })

  ipcMain.handle('todo:fetchChecklist', (_event, args: unknown) => {
    const record = readRecord(args)
    const listId = readId(record, 'listId')
    const taskId = readId(record, 'taskId')
    if (!listId || !taskId) {
      return { ok: false, kind: 'api', message: 'Missing task id.' }
    }
    return withGraph(async (run) => ({ items: await fetchTodoChecklist(run, { listId, taskId }) }))
  })

  ipcMain.handle('todo:createTask', (_event, args: unknown) => {
    const record = readRecord(args)
    const listId = readId(record, 'listId')
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    const dueDate =
      typeof record.dueDate === 'string' && DATE_PATTERN.test(record.dueDate)
        ? record.dueDate
        : null
    if (!listId || !title || title.length > MAX_TITLE_LENGTH) {
      return { ok: false, kind: 'api', message: 'Invalid task.' }
    }
    return withGraph(async (run) => ({
      task: await createTodoTask(run, { listId, title, dueDate })
    }))
  })

  ipcMain.handle('todo:setTaskCompleted', (_event, args: unknown) => {
    const record = readRecord(args)
    const listId = readId(record, 'listId')
    const taskId = readId(record, 'taskId')
    if (!listId || !taskId || typeof record.completed !== 'boolean') {
      return { ok: false, kind: 'api', message: 'Invalid task update.' }
    }
    const completed = record.completed
    return withGraph(async (run) => ({
      task: await setTodoTaskCompleted(run, { listId, taskId, completed })
    }))
  })

  ipcMain.handle('todo:updateTask', (_event, args: unknown) => {
    const record = readRecord(args)
    const listId = readId(record, 'listId')
    const taskId = readId(record, 'taskId')
    const changes = readChanges(record.changes)
    if (!listId || !taskId || !changes) {
      return { ok: false, kind: 'api', message: 'Invalid task update.' }
    }
    return withGraph(async (run) => ({
      task: await updateTodoTask(run, { listId, taskId, changes })
    }))
  })

  ipcMain.handle('todo:deleteTask', (_event, args: unknown) => {
    const record = readRecord(args)
    const listId = readId(record, 'listId')
    const taskId = readId(record, 'taskId')
    if (!listId || !taskId) {
      return { ok: false, kind: 'api', message: 'Missing task id.' }
    }
    return withGraph(async (run) => {
      await deleteTodoTask(run, { listId, taskId })
      return {}
    })
  })

  ipcMain.handle('todo:setChecklistItemChecked', (_event, args: unknown) => {
    const record = readRecord(args)
    const listId = readId(record, 'listId')
    const taskId = readId(record, 'taskId')
    const itemId = readId(record, 'itemId')
    if (!listId || !taskId || !itemId || typeof record.checked !== 'boolean') {
      return { ok: false, kind: 'api', message: 'Invalid step update.' }
    }
    const checked = record.checked
    return withGraph(async (run) => ({
      item: await setTodoChecklistItemChecked(run, { listId, taskId, itemId, checked })
    }))
  })

  ipcMain.handle('todo:deleteChecklistItem', (_event, args: unknown) => {
    const record = readRecord(args)
    const listId = readId(record, 'listId')
    const taskId = readId(record, 'taskId')
    const itemId = readId(record, 'itemId')
    if (!listId || !taskId || !itemId) {
      return { ok: false, kind: 'api', message: 'Missing step id.' }
    }
    return withGraph(async (run) => {
      await deleteTodoChecklistItem(run, { listId, taskId, itemId })
      return {}
    })
  })

  ipcMain.handle('todo:selectList', (_event, args: unknown) => {
    setMicrosoftTodoSelectedList(readId(readRecord(args), 'listId'))
  })
}
