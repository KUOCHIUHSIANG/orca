import type {
  MondayBoardGroup,
  MondayBoardSummary,
  MondayCalendarItem,
  MondayCalendarSnapshot
} from '../../shared/monday-calendar-types'
import type { MondayQueryRunner } from './monday-graphql-client'
import { mapMondayItem, mapMondayPeople, readSubitemBoardIds } from './monday-item-mapping'
import { asArray, asString, isRecord } from './monday-json-guards'

const PAGE_LIMIT = 500
// Why: bounds one refresh to ~10k items per board so a runaway cursor can't drain the daily call budget.
const MAX_PAGES_PER_BOARD = 20

const ITEM_FIELDS = `
  id
  name
  url
  group { id title }
  parent_item { id name group { id } }
  column_values(types: [people, timeline, date, status]) {
    id
    type
    text
    column { title }
    ... on PeopleValue { persons_and_teams { id kind } }
    ... on TimelineValue { from to }
    ... on DateValue { date time }
    ... on StatusValue { label is_done label_style { color } }
  }`

function boardsQuery(includeUsers: boolean): string {
  // Why: users ride along as an extra root field so the first request doesn't cost a separate call.
  return `query ($boardIds: [ID!], $limit: Int!) {
  boards(ids: $boardIds) {
    id
    name
    groups { id title }
    columns(types: [subtasks]) { settings_str }
    items_page(limit: $limit) { cursor items { ${ITEM_FIELDS} } }
  }
  ${includeUsers ? 'users(limit: 1000) { id name }' : ''}
}`
}

const NEXT_PAGE_QUERY = `query ($cursor: String!, $limit: Int!) {
  next_items_page(cursor: $cursor, limit: $limit) { cursor items { ${ITEM_FIELDS} } }
}`

function readPage(value: unknown): { cursor: string | null; items: unknown[] } {
  if (!isRecord(value)) {
    return { cursor: null, items: [] }
  }
  return {
    cursor: typeof value.cursor === 'string' && value.cursor ? value.cursor : null,
    items: asArray(value.items)
  }
}

type BoardRef = MondayBoardSummary

function readGroups(value: unknown): MondayBoardGroup[] {
  return asArray(value).flatMap((group) => {
    const id = isRecord(group) ? asString(group.id) : null
    const title = isRecord(group) ? asString(group.title) : null
    return id && title ? [{ id, title }] : []
  })
}

type BoardFetchResult = {
  items: MondayCalendarItem[]
  boards: BoardRef[]
  /** Subitem board id → the board whose subtasks column points at it. */
  subitemParents: Map<string, BoardRef>
  users: unknown
}

async function fetchBoards(
  run: MondayQueryRunner,
  boardIds: string[],
  options: { includeUsers: boolean; parentOf?: ReadonlyMap<string, BoardRef> }
): Promise<BoardFetchResult> {
  const data = await run(boardsQuery(options.includeUsers), {
    boardIds,
    limit: PAGE_LIMIT
  })
  const items: MondayCalendarItem[] = []
  const boards: BoardRef[] = []
  const subitemParents = new Map<string, BoardRef>()
  for (const rawBoard of asArray(data.boards)) {
    if (!isRecord(rawBoard) || typeof rawBoard.id !== 'string') {
      continue
    }
    const own = {
      id: rawBoard.id,
      name: typeof rawBoard.name === 'string' ? rawBoard.name : '',
      groups: readGroups(rawBoard.groups)
    }
    boards.push(own)
    for (const subitemBoardId of readSubitemBoardIds(rawBoard.columns)) {
      subitemParents.set(subitemBoardId, own)
    }
    // Why: subitems file under the board the user subscribed to, so board filters keep them together.
    const board = options.parentOf?.get(own.id) ?? own
    let page = readPage(rawBoard.items_page)
    for (let pageCount = 1; ; pageCount += 1) {
      for (const rawItem of page.items) {
        const item = mapMondayItem(rawItem, board)
        if (item) {
          items.push(item)
        }
      }
      if (!page.cursor || pageCount >= MAX_PAGES_PER_BOARD) {
        break
      }
      const next = await run(NEXT_PAGE_QUERY, { cursor: page.cursor, limit: PAGE_LIMIT })
      page = readPage(next.next_items_page)
    }
  }
  return { items, boards, subitemParents, users: data.users }
}

export async function fetchMondayCalendarSnapshot(
  run: MondayQueryRunner,
  boardIds: string[],
  now: () => number = Date.now
): Promise<MondayCalendarSnapshot> {
  // Why: boards(ids: []) means "no filter" to monday, which would pull in unsubscribed boards.
  if (boardIds.length === 0) {
    return { items: [], people: [], boards: [], fetchedAt: now() }
  }
  const main = await fetchBoards(run, boardIds, { includeUsers: true })
  const subitemParents = new Map(
    [...main.subitemParents].filter(([subitemBoardId]) => !boardIds.includes(subitemBoardId))
  )
  const subitems =
    subitemParents.size > 0
      ? (
          await fetchBoards(run, [...subitemParents.keys()], {
            includeUsers: false,
            parentOf: subitemParents
          })
        ).items
      : []
  return {
    items: [...main.items, ...subitems],
    people: mapMondayPeople(main.users),
    boards: boardIds.flatMap((id) => main.boards.filter((board) => board.id === id)),
    fetchedAt: now()
  }
}
