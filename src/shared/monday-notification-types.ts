import type { MondayFailure } from './monday-calendar-types'

export type MondayNotificationKind =
  | 'mention'
  | 'thread-reply'
  | 'owner-added'
  | 'task-update'
  | 'status-change'

export type MondayNotification = {
  /** `update:<id>`, `reply:<id>` or `column:<item>:<column>:<time>`; stable across polls. */
  id: string
  kind: MondayNotificationKind
  createdAt: string
  actorName: string | null
  itemId: string
  itemName: string | null
  /** Opens the comment itself when there is one, else the item. */
  url: string
  /** Comment text, or the new status label; kept in memory only because comments often hold credentials. */
  excerpt: string | null
  /** The new status label's monday color, for status changes. */
  statusColor: string | null
  read: boolean
}

export type MondayNotificationsState = {
  /** False until a recipient is chosen and monday.com is connected. */
  enabled: boolean
  notifications: MondayNotification[]
  unreadCount: number
  checkedAt: number | null
  error: MondayFailure | null
}

export type MondayMarkNotificationsReadArgs = { ids: string[] } | { all: true }
