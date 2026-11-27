import type {
  FeedActor,
  FeedColumnChange,
  FeedComment,
  FeedItem,
  FeedThread
} from './monday-notification-derivation'
import { asArray, asString, isRecord } from '../untrusted-json-guards'

function isAgentKind(kind: string | null): boolean {
  return kind !== null && /agent/i.test(kind)
}

export function readUsers(value: unknown): Map<string, FeedActor> {
  const users = new Map<string, FeedActor>()
  for (const user of asArray(value)) {
    const id = isRecord(user) ? asString(user.id) : null
    if (isRecord(user) && id) {
      users.set(id, { id, name: asString(user.name), isAgent: isAgentKind(asString(user.kind)) })
    }
  }
  return users
}

export function readColumnIds(boards: unknown, types: readonly string[]): string[] {
  const ids = new Set<string>()
  for (const board of asArray(boards)) {
    for (const column of isRecord(board) ? asArray(board.columns) : []) {
      const id = isRecord(column) ? asString(column.id) : null
      const type = isRecord(column) ? asString(column.type) : null
      if (id && type && types.includes(type)) {
        ids.add(id)
      }
    }
  }
  return [...ids]
}

export function isSubtasksColumn(column: unknown): boolean {
  return isRecord(column) && column.type === 'subtasks'
}

function readActor(raw: Record<string, unknown>): FeedActor | null {
  const id = asString(raw.creator_id)
  if (!id) {
    return null
  }
  const creator = isRecord(raw.creator) ? raw.creator : {}
  return { id, name: asString(creator.name), isAgent: isAgentKind(asString(creator.kind)) }
}

function readComment(
  raw: unknown,
  context: { threadId: string | null; itemId: string | null }
): FeedComment | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = asString(raw.id)
  const threadId = context.threadId ?? asString(raw.parent_id)
  const itemId = context.itemId ?? asString(raw.item_id)
  const createdAt = asString(raw.created_at)
  if (!id || !threadId || !itemId || !createdAt) {
    return null
  }
  return {
    id,
    threadId,
    isReply: id !== threadId,
    itemId,
    createdAt,
    author: readActor(raw),
    bodyHtml: asString(raw.body) ?? ''
  }
}

export function readThread(raw: Record<string, unknown>): FeedThread {
  return {
    creatorId: asString(raw.creator_id),
    replies: asArray(raw.replies).flatMap((reply) => {
      const createdAt = isRecord(reply) ? asString(reply.created_at) : null
      return isRecord(reply) && createdAt
        ? [{ creatorId: asString(reply.creator_id), createdAt }]
        : []
    })
  }
}

export type CollectedComments = {
  comments: Map<string, FeedComment>
  threads: Map<string, FeedThread>
}

export function collectUpdates(updates: unknown[], into: CollectedComments): void {
  for (const raw of updates) {
    const update = readComment(raw, {
      threadId: isRecord(raw) ? asString(raw.id) : null,
      itemId: null
    })
    if (!update || !isRecord(raw)) {
      continue
    }
    into.comments.set(update.id, update)
    into.threads.set(update.id, readThread(raw))
    for (const rawReply of asArray(raw.replies)) {
      const reply = readComment(rawReply, { threadId: update.id, itemId: update.itemId })
      if (reply) {
        into.comments.set(reply.id, reply)
      }
    }
  }
}

export function collectReplies(replies: unknown[], into: CollectedComments): void {
  for (const raw of replies) {
    const reply = readComment(raw, { threadId: null, itemId: null })
    if (reply) {
      into.comments.set(reply.id, reply)
    }
  }
}

/** monday stamps activity logs in 100ns ticks since the epoch. */
function logTimeToIso(value: unknown): string | null {
  const ticks = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN
  return Number.isFinite(ticks) && ticks > 0 ? new Date(ticks / 10_000).toISOString() : null
}

function personIdsOf(value: unknown): string[] {
  const entries = isRecord(value) ? asArray(value.personsAndTeams) : []
  return entries.flatMap((entry) =>
    isRecord(entry) && entry.kind === 'person' && entry.id !== undefined ? [String(entry.id)] : []
  )
}

export function readMondayColumnChange(
  log: unknown,
  users: ReadonlyMap<string, FeedActor>
): FeedColumnChange | null {
  if (!isRecord(log)) {
    return null
  }
  let data: unknown
  try {
    data = JSON.parse(asString(log.data) ?? '')
  } catch {
    return null
  }
  const createdAt = logTimeToIso(log.created_at)
  if (!isRecord(data) || !createdAt || data.pulse_id === undefined) {
    return null
  }
  const columnType = asString(data.column_type) ?? ''
  const isPeople = /person/i.test(columnType)
  const isStatus = columnType === 'color' || columnType === 'status'
  if (!isPeople && !isStatus) {
    return null
  }
  const previous = new Set(personIdsOf(data.previous_value))
  const label = isRecord(data.value) && isRecord(data.value.label) ? data.value.label : {}
  const userId = asString(log.user_id)
  return {
    itemId: String(data.pulse_id),
    itemName: asString(data.pulse_name),
    columnId: asString(data.column_id) ?? '',
    columnType,
    actor: userId ? (users.get(userId) ?? { id: userId, name: null, isAgent: false }) : null,
    createdAt,
    addedPersonIds: isPeople ? personIdsOf(data.value).filter((id) => !previous.has(id)) : [],
    statusLabel: isStatus ? asString(label.text) : null,
    statusColor: isStatus && isRecord(label.style) ? asString(label.style.color) : null
  }
}

export function readItem(raw: unknown): FeedItem | null {
  const id = isRecord(raw) ? asString(raw.id) : null
  const name = isRecord(raw) ? asString(raw.name) : null
  const url = isRecord(raw) ? asString(raw.url) : null
  if (!isRecord(raw) || !id || !name || !url) {
    return null
  }
  const personIds = asArray(raw.column_values).flatMap((value) =>
    isRecord(value)
      ? asArray(value.persons_and_teams).flatMap((entry) =>
          isRecord(entry) && entry.kind === 'person' && asString(entry.id) ? [String(entry.id)] : []
        )
      : []
  )
  return { id, name, url, personIds, creatorId: asString(raw.creator_id) }
}
