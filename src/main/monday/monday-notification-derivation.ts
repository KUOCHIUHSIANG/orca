import type {
  MondayNotification,
  MondayNotificationKind
} from '../../shared/monday-notification-types'

export type FeedActor = { id: string; name: string | null; isAgent: boolean }

export type FeedComment = {
  id: string
  /** The update a reply answers; an update is its own thread. */
  threadId: string
  isReply: boolean
  itemId: string
  createdAt: string
  author: FeedActor | null
  bodyHtml: string
}

export type FeedThread = {
  creatorId: string | null
  replies: { creatorId: string | null; createdAt: string }[]
}

export type FeedItem = {
  id: string
  name: string
  url: string
  personIds: string[]
  creatorId: string | null
}

export type FeedColumnChange = {
  itemId: string
  itemName: string | null
  columnId: string
  columnType: string
  actor: FeedActor | null
  createdAt: string
  /** People columns only: who this change added. */
  addedPersonIds: string[]
  /** Status columns only: the new label and its monday color. */
  statusLabel: string | null
  statusColor: string | null
}

export type MondayNotificationFeed = {
  comments: FeedComment[]
  threads: ReadonlyMap<string, FeedThread>
  items: ReadonlyMap<string, FeedItem>
  columnChanges: FeedColumnChange[]
}

export type DerivedMondayNotifications = {
  notifications: Omit<MondayNotification, 'read'>[]
  /** Latest time the recipient commented on or changed each item; earlier notifications there count as seen. */
  recipientActivity: Map<string, number>
}

const EXCERPT_LENGTH = 160
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' '
}

export function readMondayMentionedUserIds(html: string): string[] {
  const ids: string[] = []
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const id = /data-mention-type="User"/i.test(tag)
      ? /data-mention-id="(\d+)"/i.exec(tag)?.[1]
      : null
    if (id && !ids.includes(id)) {
      ids.push(id)
    }
  }
  return ids
}

export function mondayHtmlToExcerpt(html: string): string | null {
  const text = html
    .replace(/<(?:br|\/p|\/div|\/li|\/h\d)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_match, name: string) => HTML_ENTITIES[name] ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) {
    return null
  }
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text
}

function ownsItem(item: FeedItem | undefined, recipientId: string): boolean {
  return (
    item !== undefined && (item.personIds.includes(recipientId) || item.creatorId === recipientId)
  )
}

function joinedThreadBefore(
  thread: FeedThread | undefined,
  recipientId: string,
  createdAt: string
): boolean {
  if (!thread) {
    return false
  }
  const before = Date.parse(createdAt)
  return (
    thread.creatorId === recipientId ||
    thread.replies.some(
      (reply) => reply.creatorId === recipientId && Date.parse(reply.createdAt) < before
    )
  )
}

function commentKind(
  comment: FeedComment,
  feed: MondayNotificationFeed,
  recipientId: string
): MondayNotificationKind | null {
  if (readMondayMentionedUserIds(comment.bodyHtml).includes(recipientId)) {
    return 'mention'
  }
  if (
    comment.isReply &&
    joinedThreadBefore(feed.threads.get(comment.threadId), recipientId, comment.createdAt)
  ) {
    return 'thread-reply'
  }
  return ownsItem(feed.items.get(comment.itemId), recipientId) ? 'task-update' : null
}

function columnChangeKind(
  change: FeedColumnChange,
  feed: MondayNotificationFeed,
  recipientId: string
): MondayNotificationKind | null {
  if (change.addedPersonIds.includes(recipientId)) {
    return 'owner-added'
  }
  return change.statusLabel !== null && ownsItem(feed.items.get(change.itemId), recipientId)
    ? 'status-change'
    : null
}

function noteActivity(activity: Map<string, number>, itemId: string, createdAt: string): void {
  const time = Date.parse(createdAt)
  if (Number.isFinite(time) && time > (activity.get(itemId) ?? 0)) {
    activity.set(itemId, time)
  }
}

/** Turns the account-wide feed into what monday would have notified `recipientId` about. */
export function deriveMondayNotifications(
  feed: MondayNotificationFeed,
  recipientId: string
): DerivedMondayNotifications {
  const notifications: Omit<MondayNotification, 'read'>[] = []
  const recipientActivity = new Map<string, number>()

  for (const comment of feed.comments) {
    if (comment.author?.id === recipientId) {
      noteActivity(recipientActivity, comment.itemId, comment.createdAt)
      continue
    }
    // Why: Aurora (a monday agent) re-mentions people on a schedule; the user only wants people.
    if (comment.author?.isAgent) {
      continue
    }
    const item = feed.items.get(comment.itemId)
    const kind = item ? commentKind(comment, feed, recipientId) : null
    if (!item || !kind) {
      continue
    }
    const replyAnchor = comment.isReply ? `?reply=reply-${comment.id}` : ''
    notifications.push({
      id: `${comment.isReply ? 'reply' : 'update'}:${comment.id}`,
      kind,
      createdAt: comment.createdAt,
      actorName: comment.author?.name ?? null,
      itemId: item.id,
      itemName: item.name,
      url: `${item.url}/posts/${comment.threadId}${replyAnchor}`,
      excerpt: mondayHtmlToExcerpt(comment.bodyHtml),
      statusColor: null
    })
  }

  for (const change of feed.columnChanges) {
    if (change.actor?.id === recipientId) {
      noteActivity(recipientActivity, change.itemId, change.createdAt)
      continue
    }
    const item = feed.items.get(change.itemId)
    const kind = change.actor?.isAgent ? null : columnChangeKind(change, feed, recipientId)
    if (!item || !kind) {
      continue
    }
    notifications.push({
      id: `column:${change.itemId}:${change.columnId}:${Date.parse(change.createdAt)}`,
      kind,
      createdAt: change.createdAt,
      actorName: change.actor?.name ?? null,
      itemId: item.id,
      itemName: item.name,
      url: item.url,
      excerpt: kind === 'status-change' ? change.statusLabel : null,
      statusColor: kind === 'status-change' ? change.statusColor : null
    })
  }

  return { notifications, recipientActivity }
}
