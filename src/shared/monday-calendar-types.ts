export type MondayPerson = {
  id: string
  name: string
}

export type MondayCalendarItem = {
  id: string
  name: string
  url: string
  boardId: string
  boardName: string
  /** Subitems carry their parent item's group so group filters keep them together. */
  groupId: string | null
  groupTitle: string | null
  parentItemName: string | null
  ownerIds: string[]
  /** Local calendar dates (YYYY-MM-DD); endDate is inclusive. Both null when the task has no date. */
  startDate: string | null
  endDate: string | null
  statusLabel: string | null
  statusColor: string | null
  isDone: boolean
}

export type DatedMondayItem = MondayCalendarItem & { startDate: string; endDate: string }

export function isDatedMondayItem(item: MondayCalendarItem): item is DatedMondayItem {
  return item.startDate !== null && item.endDate !== null
}

export type MondayBoardGroup = {
  id: string
  title: string
}

export type MondayBoardSummary = {
  id: string
  name: string
  groups: MondayBoardGroup[]
}

export type MondayBoardDisplaySetting = {
  /** null shows every group. */
  groupId: string | null
  /** Show everyone's tasks on this board even when the people filter is narrowed. */
  ignorePeopleFilter: boolean
  /** Show this board's done tasks even when the global "show done" toggle is off. */
  includeDone: boolean
  /** Keep only tasks ending in this many most recent weeks (current week included); null keeps all. */
  recentWeeks: number | null
}

export const MONDAY_RECENT_WEEK_OPTIONS = [1, 2, 4, 8, 12] as const

export type MondayBoardDisplaySettings = Record<string, MondayBoardDisplaySetting>

export type MondayCalendarSnapshot = {
  items: MondayCalendarItem[]
  people: MondayPerson[]
  /** Subscribed boards in settings order; subitems carry their parent board's id. */
  boards: MondayBoardSummary[]
  fetchedAt: number
}

export type MondayPageTab = 'calendar' | 'docs'

/** A subscribed monday doc; object ids appear in /docs/<id> URLs, distinct from the doc id. */
export type MondayDocRef = {
  objectId: string
  url: string
}

export type MondayDocSummary = MondayDocRef & {
  /** The id export_markdown_from_doc expects. */
  id: string
  name: string
  updatedAt: string | null
}

export type MondayConnectionStatus = {
  connected: boolean
  connectedAs: string | null
  boardIds: string[]
  docs: MondayDocRef[]
  activeTab: MondayPageTab
  /** null shows every person's items. */
  selectedPersonIds: string[] | null
  /** null shows every subscribed board. */
  selectedBoardIds: string[] | null
  boardSettings: MondayBoardDisplaySettings
  showDone: boolean
  undatedExpanded: boolean
}

export type MondayErrorKind =
  | 'not-connected'
  | 'unauthorized'
  | 'rate-limited'
  | 'board-not-found'
  | 'doc-not-found'
  | 'network'
  | 'api'

export type MondayFailure = { ok: false; kind: MondayErrorKind; message: string }

export type MondayCalendarFetchResult =
  | { ok: true; snapshot: MondayCalendarSnapshot }
  | MondayFailure

export type MondayConnectArgs = {
  /** Omit to keep the stored token and only change boards. */
  apiToken?: string
  boardIds: string[]
  docObjectIds?: string[]
}

export type MondayConnectResult = { ok: true; status: MondayConnectionStatus } | MondayFailure

export type MondayPreferencesUpdate = {
  selectedPersonIds?: string[] | null
  selectedBoardIds?: string[] | null
  boardSettings?: MondayBoardDisplaySettings
  showDone?: boolean
  undatedExpanded?: boolean
  activeTab?: MondayPageTab
}

export type MondayDocListResult = { ok: true; docs: MondayDocSummary[] } | MondayFailure

export type MondayDocContentResult = { ok: true; markdown: string } | MondayFailure

export type MondayUpdateAttachment = {
  id: string
  name: string
  url: string
}

export type MondayUpdateEntry = {
  id: string
  authorName: string | null
  createdAt: string | null
  /** monday HTML with inline image sources rewritten to signed URLs; sanitize before rendering. */
  bodyHtml: string
  /** Files not already shown inline in the body. */
  attachments: MondayUpdateAttachment[]
}

export type MondayUpdate = MondayUpdateEntry & { replies: MondayUpdateEntry[] }

export type MondayItemUpdatesResult = { ok: true; updates: MondayUpdate[] } | MondayFailure

/** Narrows untrusted JSON (disk or IPC) to board display settings, dropping malformed entries. */
export function parseMondayBoardDisplaySettings(value: unknown): MondayBoardDisplaySettings {
  const settings: MondayBoardDisplaySettings = {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return settings
  }
  for (const [boardId, raw] of Object.entries(value)) {
    if (!/^\d+$/.test(boardId) || typeof raw !== 'object' || raw === null) {
      continue
    }
    const entry: Record<string, unknown> = { ...raw }
    const recentWeeks = entry.recentWeeks
    settings[boardId] = {
      groupId: typeof entry.groupId === 'string' && entry.groupId ? entry.groupId : null,
      ignorePeopleFilter: entry.ignorePeopleFilter === true,
      includeDone: entry.includeDone === true,
      recentWeeks:
        typeof recentWeeks === 'number' &&
        Number.isInteger(recentWeeks) &&
        recentWeeks > 0 &&
        recentWeeks <= 52
          ? recentWeeks
          : null
    }
  }
  return settings
}

const BOARD_REFERENCE = /\/boards\/(\d+)/
const BARE_ID_REFERENCE = /^(\d+)$/
const DOC_REFERENCE = /(?:^|\/)docs\/(\d+)/

function collectReferenceIds(text: string, patterns: readonly RegExp[]): string[] {
  const ids: string[] = []
  for (const token of text.split(/[\s,]+/)) {
    const id = patterns.map((pattern) => pattern.exec(token)?.[1]).find(Boolean)
    if (id && !ids.includes(id)) {
      ids.push(id)
    }
  }
  return ids
}

/** Accepts board URLs (…/boards/123…) or bare numeric IDs, one per line or comma-separated. */
export function parseMondayBoardReferences(text: string): string[] {
  return collectReferenceIds(text, [BOARD_REFERENCE, BARE_ID_REFERENCE])
}

/** Doc URLs (…/docs/123…); a bare number is always read as a board. */
export function parseMondayDocReferences(text: string): string[] {
  return collectReferenceIds(text, [DOC_REFERENCE])
}

/** Tokens that are neither a board nor a doc reference, so the form can say what it skipped. */
export function findUnrecognizedMondayReferences(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .filter(Boolean)
    .filter(
      (token) =>
        !BOARD_REFERENCE.test(token) && !BARE_ID_REFERENCE.test(token) && !DOC_REFERENCE.test(token)
    )
}
