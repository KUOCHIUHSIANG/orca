import { getMainHttpClient } from '../network/http-client'
import { asArray, asString, isRecord } from '../untrusted-json-guards'
import type { MicrosoftTodoList, MicrosoftTodoTask } from '../../shared/microsoft-todo-types'
import { MicrosoftTodoError } from './microsoft-todo-auth'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const REQUEST_TIMEOUT_MS = 20_000
const MAX_PAGES = 10

export type GraphRunner = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  pathOrUrl: string,
  body?: Record<string, unknown>
) => Promise<unknown>

/** Graph calls with a bearer token; a 401 forces one token refresh and retry. */
export function createGraphRunner(
  getAccessToken: (forceRefresh: boolean) => Promise<string>
): GraphRunner {
  const send = async (
    method: string,
    url: string,
    body: Record<string, unknown> | undefined,
    token: string
  ): Promise<Response> => {
    try {
      return await getMainHttpClient().fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      throw new MicrosoftTodoError(
        'network',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
  return async (method, pathOrUrl, body) => {
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`
    let response = await send(method, url, body, await getAccessToken(false))
    if (response.status === 401) {
      response = await send(method, url, body, await getAccessToken(true))
    }
    const payload: unknown =
      response.status === 204 ? null : await response.json().catch(() => null)
    if (response.ok) {
      return payload
    }
    const message =
      isRecord(payload) && isRecord(payload.error) ? asString(payload.error.message) : null
    if (response.status === 429) {
      throw new MicrosoftTodoError('rate-limited', message ?? 'Microsoft Graph rate limit reached.')
    }
    if (response.status === 401) {
      throw new MicrosoftTodoError('signed-out', message ?? 'Microsoft sign-in expired.')
    }
    throw new MicrosoftTodoError(
      'api',
      message ?? `Microsoft Graph error (HTTP ${response.status}).`
    )
  }
}

export async function collectPages(run: GraphRunner, firstUrl: string): Promise<unknown[]> {
  const rows: unknown[] = []
  let next: string | null = firstUrl
  for (let page = 0; next && page < MAX_PAGES; page += 1) {
    const payload = await run('GET', next)
    rows.push(...(isRecord(payload) ? asArray(payload.value) : []))
    next = isRecord(payload) ? asString(payload['@odata.nextLink']) : null
  }
  return rows
}

// Why: a To Do due date is date-only — the service keeps just the date part of dueDateTime, so
// converting time zones shifts it (local midnight +8 becomes the previous day in UTC).
export function toLocalDueDate(value: unknown): string | null {
  const dateTime = isRecord(value) ? asString(value.dateTime) : null
  return dateTime && /^\d{4}-\d{2}-\d{2}/.test(dateTime) ? dateTime.slice(0, 10) : null
}

export function toGraphDueDateTime(date: string): { dateTime: string; timeZone: 'UTC' } {
  return { dateTime: `${date}T00:00:00`, timeZone: 'UTC' }
}

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
}

/** To Do notes arrive as text or HTML; the panel only ever shows plain text. */
export function readNotes(body: unknown): string | null {
  if (!isRecord(body)) {
    return null
  }
  const content = asString(body.content) ?? ''
  const text =
    body.contentType === 'html'
      ? content
          .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
      : content
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  return trimmed || null
}

function toUtcInstant(value: unknown): string | null {
  if (!isRecord(value) || asString(value.timeZone) !== 'UTC') {
    return null
  }
  const dateTime = asString(value.dateTime)
  return dateTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateTime)
    ? `${dateTime.slice(0, 19)}Z`
    : null
}

export function mapTodoTask(raw: unknown, listId: string): MicrosoftTodoTask | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = asString(raw.id)
  if (!id) {
    return null
  }
  return {
    id,
    listId,
    title: asString(raw.title) ?? '',
    completed: raw.status === 'completed',
    important: raw.importance === 'high',
    dueDate: toLocalDueDate(raw.dueDateTime),
    completedAt: isRecord(raw.completedDateTime) ? asString(raw.completedDateTime.dateTime) : null,
    createdAt: asString(raw.createdDateTime),
    notes: readNotes(raw.body),
    reminderAt: raw.isReminderOn === true ? toUtcInstant(raw.reminderDateTime) : null,
    webUrl: `https://to-do.live.com/tasks/id/${encodeURIComponent(id)}/details`
  }
}

export async function fetchTodoLists(run: GraphRunner): Promise<MicrosoftTodoList[]> {
  const rows = await collectPages(run, '/me/todo/lists')
  return rows.flatMap((row) => {
    const id = isRecord(row) ? asString(row.id) : null
    if (!isRecord(row) || !id) {
      return []
    }
    return [
      { id, name: asString(row.displayName) ?? id, wellKnownName: asString(row.wellknownListName) }
    ]
  })
}

export async function fetchTodoTasks(
  run: GraphRunner,
  listId: string
): Promise<MicrosoftTodoTask[]> {
  const rows = await collectPages(
    run,
    `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100`
  )
  return rows
    .map((row) => mapTodoTask(row, listId))
    .filter((task): task is MicrosoftTodoTask => task !== null)
}

export async function createTodoTask(
  run: GraphRunner,
  args: { listId: string; title: string; dueDate: string | null; notes: string | null }
): Promise<MicrosoftTodoTask> {
  const payload = await run('POST', `/me/todo/lists/${encodeURIComponent(args.listId)}/tasks`, {
    title: args.title,
    ...(args.dueDate ? { dueDateTime: toGraphDueDateTime(args.dueDate) } : {}),
    ...(args.notes ? { body: { content: args.notes, contentType: 'text' } } : {})
  })
  const task = mapTodoTask(payload, args.listId)
  if (!task) {
    throw new MicrosoftTodoError('api', 'Microsoft did not return the new task.')
  }
  return task
}

export async function setTodoTaskCompleted(
  run: GraphRunner,
  args: { listId: string; taskId: string; completed: boolean }
): Promise<MicrosoftTodoTask> {
  const payload = await run('PATCH', taskPath(args.listId, args.taskId), {
    status: args.completed ? 'completed' : 'notStarted'
  })
  const task = mapTodoTask(payload, args.listId)
  if (!task) {
    throw new MicrosoftTodoError('api', 'Microsoft did not return the updated task.')
  }
  return task
}

export async function fetchAccountName(run: GraphRunner): Promise<string | null> {
  const payload = await run('GET', '/me?$select=displayName,userPrincipalName,mail')
  if (!isRecord(payload)) {
    return null
  }
  return (
    asString(payload.mail) ?? asString(payload.userPrincipalName) ?? asString(payload.displayName)
  )
}

export function taskPath(listId: string, taskId: string): string {
  return `/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`
}

export type TodoTaskChanges = {
  title?: string
  /** null clears the due date. */
  dueDate?: string | null
  important?: boolean
  notes?: string
}

export async function updateTodoTask(
  run: GraphRunner,
  args: { listId: string; taskId: string; changes: TodoTaskChanges }
): Promise<MicrosoftTodoTask> {
  const { changes } = args
  const payload = await run('PATCH', taskPath(args.listId, args.taskId), {
    ...(changes.title !== undefined ? { title: changes.title } : {}),
    ...(changes.dueDate !== undefined
      ? { dueDateTime: changes.dueDate ? toGraphDueDateTime(changes.dueDate) : null }
      : {}),
    ...(changes.important !== undefined
      ? { importance: changes.important ? 'high' : 'normal' }
      : {}),
    // Why: Orca edits notes as plain text, so they go back as text even if they arrived as HTML.
    ...(changes.notes !== undefined
      ? { body: { content: changes.notes, contentType: 'text' } }
      : {})
  })
  const task = mapTodoTask(payload, args.listId)
  if (!task) {
    throw new MicrosoftTodoError('api', 'Microsoft did not return the updated task.')
  }
  return task
}

export async function deleteTodoTask(
  run: GraphRunner,
  args: { listId: string; taskId: string }
): Promise<void> {
  await run('DELETE', taskPath(args.listId, args.taskId))
}
