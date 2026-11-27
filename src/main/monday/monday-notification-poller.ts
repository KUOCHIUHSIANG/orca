import { powerMonitor } from 'electron'
import type { MondayFailure } from '../../shared/monday-calendar-types'
import type {
  MondayMarkNotificationsReadArgs,
  MondayNotification,
  MondayNotificationsState
} from '../../shared/monday-notification-types'
import { getMondayConnectionStatus, loadMondayToken } from './monday-credential-store'
import { createMondayQueryRunner, MondayApiError, toMondayFailure } from './monday-graphql-client'
import { deriveMondayNotifications, type FeedItem } from './monday-notification-derivation'
import {
  fetchMondayNotificationFeed,
  fetchMondayNotificationScope,
  type MondayNotificationScope
} from './monday-notification-feed'
import {
  isMondayNotificationRead,
  loadMondayNotificationReadState,
  saveMondayNotificationsRead
} from './monday-notification-read-state'

// Why: the current version (2026-10) has no Reply.parent_id/item_id, which the feed needs;
// 2027-01 becomes current in January 2027.
const NOTIFICATIONS_API_VERSION = '2027-01'
const POLL_INTERVAL_MS = 3 * 60_000
// Why: the daily call budget is shared by the whole monday account, so an unattended machine
// slows down; unlocking or waking it checks right away.
const IDLE_POLL_INTERVAL_MS = 15 * 60_000
const IDLE_AFTER_SECONDS = 15 * 60
const FIRST_POLL_DELAY_MS = 5_000
const MAX_RETRY_MS = 30 * 60_000
const WAKE_RECHECK_AFTER_MS = 60_000
const LOOKBACK_MS = 14 * 24 * 60 * 60_000
// Why: each poll re-reads a few minutes so comments indexed late aren't skipped; ids dedupe the overlap.
const WINDOW_OVERLAP_MS = 5 * 60_000
const ITEM_CACHE_TTL_MS = 30 * 60_000
const MAX_NOTIFICATIONS = 200

type Session = { key: string; recipientId: string; boardIds: string[] }
type StoredNotification = Omit<MondayNotification, 'read'>

let session: Session | null = null
let scope: MondayNotificationScope | null = null
let windowStart: number | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight: { session: Session; promise: Promise<void> } | null = null
let checkedAt: number | null = null
let lastError: MondayFailure | null = null
let consecutiveFailures = 0
let wakeHandlersInstalled = false
const notifications = new Map<string, StoredNotification>()
const recipientActivity = new Map<string, number>()
const itemCache = new Map<string, { item: FeedItem; fetchedAt: number }>()
const listeners = new Set<(state: MondayNotificationsState) => void>()

function isRead(notification: StoredNotification): boolean {
  // Why: read state can't sync back from monday.com, so acting on the item there counts as seeing it.
  return (
    isMondayNotificationRead(notification.id) ||
    (recipientActivity.get(notification.itemId) ?? 0) > Date.parse(notification.createdAt)
  )
}

export function getMondayNotificationsState(): MondayNotificationsState {
  const sorted = [...notifications.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((notification) => ({ ...notification, read: isRead(notification) }))
  return {
    enabled: session !== null,
    notifications: sorted,
    unreadCount: sorted.filter((notification) => !notification.read).length,
    checkedAt,
    error: lastError
  }
}

export function onMondayNotificationsChanged(
  listener: (state: MondayNotificationsState) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  const state = getMondayNotificationsState()
  for (const listener of listeners) {
    listener(state)
  }
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function schedule(delayMs: number): void {
  clearTimer()
  timer = setTimeout(() => void pollNow(), delayMs)
}

function resetSession(next: Session | null): void {
  clearTimer()
  session = next
  scope = null
  windowStart = null
  checkedAt = null
  lastError = null
  consecutiveFailures = 0
  notifications.clear()
  recipientActivity.clear()
  itemCache.clear()
}

function installWakeHandlers(): void {
  if (wakeHandlersInstalled) {
    return
  }
  wakeHandlersInstalled = true
  const pollIfStale = (): void => {
    // Only a running, unthrottled session; a spent budget or a token error keeps waiting.
    if (
      timer &&
      lastError?.kind !== 'rate-limited' &&
      Date.now() - (checkedAt ?? 0) > WAKE_RECHECK_AFTER_MS
    ) {
      void pollNow()
    }
  }
  powerMonitor.on('resume', pollIfStale)
  powerMonitor.on('unlock-screen', pollIfStale)
}

/** Re-reads the connection and recipient; call after anything that may change them. */
export async function syncMondayNotificationSession(): Promise<void> {
  await loadMondayNotificationReadState()
  installWakeHandlers()
  const status = await getMondayConnectionStatus()
  const recipientId = status.connected ? status.notifyPersonId : null
  const next = recipientId
    ? { key: `${recipientId}|${status.boardIds.join(',')}`, recipientId, boardIds: status.boardIds }
    : null
  if (next?.key === session?.key) {
    // A reconnect resumes a session that stopped on a token error.
    if (session && !timer && inFlight?.session !== session) {
      schedule(FIRST_POLL_DELAY_MS)
    }
    return
  }
  resetSession(next)
  if (next) {
    schedule(FIRST_POLL_DELAY_MS)
  }
  emit()
}

function keepNewest(limit: number): void {
  const overflow = notifications.size - limit
  if (overflow <= 0) {
    return
  }
  const oldestFirst = [...notifications.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  )
  for (const notification of oldestFirst.slice(0, overflow)) {
    notifications.delete(notification.id)
  }
}

function pruneBefore(cutoff: number, now: number): void {
  for (const [id, notification] of notifications) {
    if (Date.parse(notification.createdAt) < cutoff) {
      notifications.delete(id)
    }
  }
  for (const [itemId, time] of recipientActivity) {
    if (time < cutoff) {
      recipientActivity.delete(itemId)
    }
  }
  for (const [itemId, entry] of itemCache) {
    if (entry.fetchedAt < now - ITEM_CACHE_TTL_MS) {
      itemCache.delete(itemId)
    }
  }
}

function nextPollDelay(): number {
  return powerMonitor.getSystemIdleTime() >= IDLE_AFTER_SECONDS
    ? IDLE_POLL_INTERVAL_MS
    : POLL_INTERVAL_MS
}

function retryDelayAfter(error: unknown, failure: MondayFailure): number | null {
  // Why: token and keychain failures won't fix themselves; retrying would only re-prompt. Reconnecting resumes.
  if (
    !(error instanceof MondayApiError) ||
    failure.kind === 'unauthorized' ||
    failure.kind === 'not-connected'
  ) {
    return null
  }
  if (failure.kind === 'rate-limited') {
    return MAX_RETRY_MS
  }
  return Math.min(POLL_INTERVAL_MS * 2 ** (consecutiveFailures - 1), MAX_RETRY_MS)
}

async function poll(): Promise<void> {
  const current = session
  if (!current) {
    return
  }
  clearTimer()
  const startedAt = Date.now()
  let retryInMs: number | null = null
  try {
    const token = loadMondayToken()
    if (!token) {
      throw new MondayApiError('not-connected', '')
    }
    const run = createMondayQueryRunner(token, NOTIFICATIONS_API_VERSION)
    const currentScope = scope ?? (await fetchMondayNotificationScope(run, current.boardIds))
    pruneBefore(startedAt - LOOKBACK_MS, startedAt)
    const feed = await fetchMondayNotificationFeed(run, {
      scope: currentScope,
      recipientId: current.recipientId,
      since: new Date(windowStart ?? startedAt - LOOKBACK_MS).toISOString(),
      cachedItems: new Map([...itemCache].map(([id, entry]) => [id, entry.item]))
    })
    if (session !== current) {
      return
    }
    scope = currentScope
    for (const itemId of feed.staleItemIds) {
      itemCache.delete(itemId)
    }
    for (const item of feed.fetchedItems) {
      itemCache.set(item.id, { item, fetchedAt: startedAt })
    }
    const derived = deriveMondayNotifications(feed, current.recipientId)
    const cutoff = startedAt - LOOKBACK_MS
    // Old threads with new replies come back whole, so their older replies are filtered here.
    for (const notification of derived.notifications) {
      if (Date.parse(notification.createdAt) >= cutoff) {
        notifications.set(notification.id, notification)
      }
    }
    keepNewest(MAX_NOTIFICATIONS)
    for (const [itemId, time] of derived.recipientActivity) {
      if (time > (recipientActivity.get(itemId) ?? 0)) {
        recipientActivity.set(itemId, time)
      }
    }
    windowStart = startedAt - WINDOW_OVERLAP_MS
    checkedAt = Date.now()
    lastError = null
    consecutiveFailures = 0
    retryInMs = nextPollDelay()
  } catch (error) {
    if (session !== current) {
      return
    }
    lastError = toMondayFailure(error)
    consecutiveFailures += 1
    retryInMs = retryDelayAfter(error, lastError)
  }
  if (retryInMs !== null) {
    schedule(retryInMs)
  }
  emit()
}

function pollNow(): Promise<void> {
  const current = session
  if (!current) {
    return Promise.resolve()
  }
  // Why: a poll from a replaced session bails out on its own, so it must not stand in for this one.
  if (inFlight?.session !== current) {
    const entry = {
      session: current,
      promise: poll().finally(() => {
        if (inFlight === entry) {
          inFlight = null
        }
      })
    }
    inFlight = entry
  }
  return inFlight.promise
}

export async function refreshMondayNotifications(): Promise<MondayNotificationsState> {
  await pollNow()
  return getMondayNotificationsState()
}

export async function markMondayNotificationsRead(
  args: MondayMarkNotificationsReadArgs
): Promise<MondayNotificationsState> {
  const targets =
    'all' in args
      ? [...notifications.values()].filter((notification) => !isRead(notification))
      : args.ids.flatMap((id) => notifications.get(id) ?? [])
  if (targets.length > 0) {
    await loadMondayNotificationReadState()
    await saveMondayNotificationsRead(
      targets.map(({ id, createdAt }) => ({ id, createdAt })),
      Date.now() - LOOKBACK_MS
    )
    emit()
  }
  return getMondayNotificationsState()
}
