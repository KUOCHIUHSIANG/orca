import type { MondayQueryRunner } from './monday-graphql-client'
import { readSubitemBoardIds } from './monday-item-mapping'
import type {
  FeedActor,
  FeedItem,
  FeedThread,
  MondayNotificationFeed
} from './monday-notification-derivation'
import {
  collectReplies,
  collectUpdates,
  isSubtasksColumn,
  readColumnIds,
  readItem,
  readMondayColumnChange,
  readThread,
  readUsers,
  type CollectedComments
} from './monday-notification-parsing'
import { asArray, asString, isRecord } from '../untrusted-json-guards'

const PAGE_LIMIT = 100
// Why: bounds the 14-day catch-up so a busy account can't drain the daily call budget.
const MAX_PAGES = 5
// 2^3 time slices of updates at most.
const MAX_UPDATE_SPLITS = 3
const LOG_LIMIT = 1000

export type MondayNotificationScope = {
  /** Subscribed boards plus their subitem boards; replies and column history are board-scoped. */
  boardIds: string[]
  /** People and status columns on those boards. */
  columnIds: string[]
  users: ReadonlyMap<string, FeedActor>
}

const SCOPE_QUERY = `query ($boardIds: [ID!]) {
  boards(ids: $boardIds) { id columns(types: [subtasks, people, status]) { id type settings_str } }
  users(limit: 1000) { id name kind }
}`

const SUBITEM_COLUMNS_QUERY = `query ($boardIds: [ID!]) {
  boards(ids: $boardIds) { id columns(types: [people, status]) { id type } }
}`

const COMMENT_FIELDS = 'id body created_at creator_id creator { name kind }'
const UPDATE_FIELDS = `${COMMENT_FIELDS} item_id replies { ${COMMENT_FIELDS} }`
const REPLY_FIELDS = `${COMMENT_FIELDS} parent_id item_id`

function windowQuery(withBoards: boolean): string {
  // Why: one request covers a whole poll so steady-state polling costs one call.
  return `query ($since: String!, $limit: Int!${withBoards ? ', $boardIds: [ID!], $logsSince: ISO8601DateTime, $columnIds: [String]' : ''}) {
  updates(from_date: $since, limit: $limit) { ${UPDATE_FIELDS} }
  ${
    withBoards
      ? `replies(board_ids: $boardIds, created_at_from: $since, limit: $limit) { ${REPLY_FIELDS} }
  boards(ids: $boardIds) { activity_logs(from: $logsSince, column_ids: $columnIds, limit: ${LOG_LIMIT}) { created_at user_id data } }`
      : ''
  }
}`
}

const UPDATES_RANGE_QUERY = `query ($since: String!, $until: String!, $limit: Int!) {
  updates(from_date: $since, to_date: $until, limit: $limit) { ${UPDATE_FIELDS} }
}`

const REPLIES_PAGE_QUERY = `query ($since: String!, $limit: Int!, $page: Int!, $boardIds: [ID!]) {
  replies(board_ids: $boardIds, created_at_from: $since, limit: $limit, page: $page) { ${REPLY_FIELDS} }
}`

const ITEM_FIELDS = `id name url creator_id
  column_values(types: [people]) { ... on PeopleValue { persons_and_teams { id kind } } }`

function lookupQuery(withItems: boolean, withThreads: boolean): string {
  // Why: an empty ids list makes monday return the latest rows instead of none, so each field is opt-in.
  return `query ($limit: Int!${withItems ? ', $itemIds: [ID!]' : ''}${withThreads ? ', $threadIds: [ID!]' : ''}) {
  ${withItems ? `items(ids: $itemIds, limit: $limit) { ${ITEM_FIELDS} }` : ''}
  ${withThreads ? 'updates(ids: $threadIds, limit: $limit) { id creator_id replies { creator_id created_at } }' : ''}
}`
}

export async function fetchMondayNotificationScope(
  run: MondayQueryRunner,
  boardIds: string[]
): Promise<MondayNotificationScope> {
  if (boardIds.length === 0) {
    const data = await run('query { users(limit: 1000) { id name kind } }', {})
    return { boardIds: [], columnIds: [], users: readUsers(data.users) }
  }
  const data = await run(SCOPE_QUERY, { boardIds })
  const boards = asArray(data.boards)
  const subitemBoardIds = boards
    .flatMap((board) =>
      isRecord(board) ? readSubitemBoardIds(asArray(board.columns).filter(isSubtasksColumn)) : []
    )
    .filter((id) => !boardIds.includes(id))
  const columnIds = readColumnIds(boards, ['people', 'status'])
  if (subitemBoardIds.length > 0) {
    const subitems = await run(SUBITEM_COLUMNS_QUERY, { boardIds: subitemBoardIds })
    for (const id of readColumnIds(subitems.boards, ['people', 'status'])) {
      if (!columnIds.includes(id)) {
        columnIds.push(id)
      }
    }
  }
  return {
    boardIds: [...boardIds, ...new Set(subitemBoardIds)],
    columnIds,
    users: readUsers(data.users)
  }
}

async function fetchRemainingPages(
  run: MondayQueryRunner,
  query: string,
  field: string,
  variables: Record<string, unknown>,
  firstPage: unknown[]
): Promise<unknown[]> {
  const rows = [...firstPage]
  let pageRows = firstPage
  for (let page = 2; pageRows.length >= PAGE_LIMIT && page <= MAX_PAGES; page++) {
    pageRows = asArray((await run(query, { ...variables, page }))[field])
    rows.push(...pageRows)
  }
  return rows
}

/**
 * monday's `page` argument skips rows once `from_date` is set (page 2 comes back empty while
 * page 4 has rows), so a full page is split in half by time instead of paged.
 */
async function fetchUpdatesBetween(
  run: MondayQueryRunner,
  range: { since: string; until: string },
  firstPage: unknown[],
  splits = 0
): Promise<unknown[]> {
  if (firstPage.length < PAGE_LIMIT || splits >= MAX_UPDATE_SPLITS) {
    return firstPage
  }
  const middle = new Date((Date.parse(range.since) + Date.parse(range.until)) / 2).toISOString()
  const rows: unknown[] = []
  for (const half of [
    { since: range.since, until: middle },
    { since: middle, until: range.until }
  ]) {
    const page = asArray((await run(UPDATES_RANGE_QUERY, { ...half, limit: PAGE_LIMIT })).updates)
    rows.push(...(await fetchUpdatesBetween(run, half, page, splits + 1)))
  }
  return rows
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function lookupItemsAndThreads(
  run: MondayQueryRunner,
  itemIds: string[],
  threadIds: string[]
): Promise<{ items: FeedItem[]; threads: Map<string, FeedThread> }> {
  const items: FeedItem[] = []
  const threads = new Map<string, FeedThread>()
  const itemChunks = chunk(itemIds, PAGE_LIMIT)
  const threadChunks = chunk(threadIds, PAGE_LIMIT)
  for (let index = 0; index < Math.max(itemChunks.length, threadChunks.length); index++) {
    const itemChunk = itemChunks[index]
    const threadChunk = threadChunks[index]
    const data = await run(lookupQuery(Boolean(itemChunk), Boolean(threadChunk)), {
      limit: PAGE_LIMIT,
      ...(itemChunk ? { itemIds: itemChunk } : {}),
      ...(threadChunk ? { threadIds: threadChunk } : {})
    })
    items.push(...asArray(data.items).flatMap((raw) => readItem(raw) ?? []))
    for (const raw of asArray(data.updates)) {
      const id = isRecord(raw) ? asString(raw.id) : null
      if (isRecord(raw) && id) {
        threads.set(id, readThread(raw))
      }
    }
  }
  return { items, threads }
}

export type MondayNotificationFeedResult = MondayNotificationFeed & {
  /** Items fetched this time, for the caller's cache. */
  fetchedItems: FeedItem[]
  /** Items whose owners changed; drop them from the cache unless just fetched. */
  staleItemIds: Set<string>
}

/** Everything since `since` that could notify `recipientId`, with the items and threads needed to tell. */
export async function fetchMondayNotificationFeed(
  run: MondayQueryRunner,
  args: {
    scope: MondayNotificationScope
    recipientId: string
    since: string
    cachedItems: ReadonlyMap<string, FeedItem>
  }
): Promise<MondayNotificationFeedResult> {
  const { scope, recipientId, since } = args
  const until = new Date().toISOString()
  const withBoards = scope.boardIds.length > 0
  const boardVariables = withBoards ? { boardIds: scope.boardIds } : {}
  const data = await run(windowQuery(withBoards), {
    since,
    limit: PAGE_LIMIT,
    ...(withBoards ? { ...boardVariables, logsSince: since, columnIds: scope.columnIds } : {})
  })
  const collected: CollectedComments = { comments: new Map(), threads: new Map() }
  collectUpdates(await fetchUpdatesBetween(run, { since, until }, asArray(data.updates)), collected)
  if (withBoards) {
    collectReplies(
      await fetchRemainingPages(
        run,
        REPLIES_PAGE_QUERY,
        'replies',
        { since, limit: PAGE_LIMIT, ...boardVariables },
        asArray(data.replies)
      ),
      collected
    )
  }
  const columnChanges = asArray(data.boards).flatMap((board) =>
    asArray(isRecord(board) ? board.activity_logs : []).flatMap(
      (log) => readMondayColumnChange(log, scope.users) ?? []
    )
  )

  const comments = [...collected.comments.values()]
  const candidates = comments.filter(
    (comment) => comment.author?.id !== recipientId && !comment.author?.isAgent
  )
  const wantedItemIds = new Set([
    ...candidates.map((comment) => comment.itemId),
    ...columnChanges
      .filter((change) => change.actor?.id !== recipientId)
      .filter(
        (change) => change.statusLabel !== null || change.addedPersonIds.includes(recipientId)
      )
      .map((change) => change.itemId)
  ])
  // Why: an owner change makes the cached owners stale, so those items are fetched again.
  const staleItemIds = new Set(
    columnChanges
      .filter((change) => /person/i.test(change.columnType))
      .map((change) => change.itemId)
  )
  const missingItemIds = [...wantedItemIds].filter(
    (id) => !args.cachedItems.has(id) || staleItemIds.has(id)
  )
  const missingThreadIds = [
    ...new Set(
      candidates
        .filter((comment) => comment.isReply && !collected.threads.has(comment.threadId))
        .map((comment) => comment.threadId)
    )
  ]
  const lookup =
    missingItemIds.length + missingThreadIds.length > 0
      ? await lookupItemsAndThreads(run, missingItemIds, missingThreadIds)
      : { items: [], threads: new Map<string, FeedThread>() }

  const items = new Map(args.cachedItems)
  for (const item of lookup.items) {
    items.set(item.id, item)
  }
  return {
    comments,
    threads: new Map([...collected.threads, ...lookup.threads]),
    items,
    columnChanges,
    fetchedItems: lookup.items,
    staleItemIds
  }
}
