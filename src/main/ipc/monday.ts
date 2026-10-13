import { ipcMain } from 'electron'
import {
  clearMondayConnection,
  getMondayConnectionStatus,
  loadMondayToken,
  saveMondayConnection,
  updateMondayPreferences
} from '../monday/monday-credential-store'
import { verifyMondayAccess } from '../monday/monday-access-verification'
import { fetchMondayCalendarSnapshot } from '../monday/monday-calendar-fetch'
import { fetchMondayDocList, fetchMondayDocMarkdown } from '../monday/monday-docs'
import { createMondayQueryRunner, MondayApiError } from '../monday/monday-graphql-client'
import { fetchMondayItemUpdates } from '../monday/monday-item-updates'
import {
  parseMondayBoardDisplaySettings,
  type MondayCalendarFetchResult,
  type MondayConnectResult,
  type MondayDocContentResult,
  type MondayDocListResult,
  type MondayFailure,
  type MondayItemUpdatesResult,
  type MondayPreferencesUpdate
} from '../../shared/monday-calendar-types'

let inFlightFetch: { boardKey: string; promise: Promise<MondayCalendarFetchResult> } | null = null

function toFailure(error: unknown): MondayFailure {
  if (error instanceof MondayApiError) {
    return { ok: false, kind: error.kind, message: error.message }
  }
  return { ok: false, kind: 'api', message: error instanceof Error ? error.message : String(error) }
}

function normalizeIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const ids = value.filter(
    (entry): entry is string => typeof entry === 'string' && /^\d+$/.test(entry)
  )
  return ids.length === value.length ? [...new Set(ids)] : null
}

async function connect(args: unknown): Promise<MondayConnectResult> {
  const record = typeof args === 'object' && args !== null ? { ...args } : {}
  const boardIds = normalizeIdList('boardIds' in record ? record.boardIds : null)
  const docObjectIds = normalizeIdList('docObjectIds' in record ? record.docObjectIds : []) ?? []
  if (!boardIds || boardIds.length + docObjectIds.length === 0) {
    return { ok: false, kind: 'board-not-found', message: '' }
  }
  try {
    const rawToken = 'apiToken' in record ? record.apiToken : undefined
    const apiToken =
      typeof rawToken === 'string' && rawToken.trim() ? rawToken.trim() : loadMondayToken()
    if (!apiToken) {
      return { ok: false, kind: 'not-connected', message: '' }
    }
    const access = await verifyMondayAccess(
      createMondayQueryRunner(apiToken),
      boardIds,
      docObjectIds
    )
    saveMondayConnection({ apiToken, ...access })
    return { ok: true, status: getMondayConnectionStatus() }
  } catch (error) {
    return toFailure(error)
  }
}

async function fetchCalendar(): Promise<MondayCalendarFetchResult> {
  const status = getMondayConnectionStatus()
  if (!status.connected) {
    return { ok: false, kind: 'not-connected', message: '' }
  }
  try {
    const token = loadMondayToken()
    if (!token) {
      return { ok: false, kind: 'not-connected', message: '' }
    }
    const snapshot = await fetchMondayCalendarSnapshot(
      createMondayQueryRunner(token),
      status.boardIds
    )
    return { ok: true, snapshot }
  } catch (error) {
    return toFailure(error)
  }
}

function connectedRunner(): ReturnType<typeof createMondayQueryRunner> | null {
  const token = getMondayConnectionStatus().connected ? loadMondayToken() : null
  return token ? createMondayQueryRunner(token) : null
}

async function fetchDocs(): Promise<MondayDocListResult> {
  try {
    const run = connectedRunner()
    if (!run) {
      return { ok: false, kind: 'not-connected', message: '' }
    }
    const objectIds = getMondayConnectionStatus().docs.map((doc) => doc.objectId)
    return { ok: true, docs: await fetchMondayDocList(run, objectIds) }
  } catch (error) {
    return toFailure(error)
  }
}

async function fetchDocContent(args: unknown): Promise<MondayDocContentResult> {
  const record = typeof args === 'object' && args !== null ? { ...args } : {}
  const docId = 'docId' in record ? record.docId : null
  if (typeof docId !== 'string' || !/^\d+$/.test(docId)) {
    return { ok: false, kind: 'api', message: 'Invalid monday.com doc id.' }
  }
  try {
    const run = connectedRunner()
    if (!run) {
      return { ok: false, kind: 'not-connected', message: '' }
    }
    return { ok: true, markdown: await fetchMondayDocMarkdown(run, docId) }
  } catch (error) {
    return toFailure(error)
  }
}

async function fetchItemUpdates(args: unknown): Promise<MondayItemUpdatesResult> {
  const record = typeof args === 'object' && args !== null ? { ...args } : {}
  const itemId = 'itemId' in record ? record.itemId : null
  if (typeof itemId !== 'string' || !/^\d+$/.test(itemId)) {
    return { ok: false, kind: 'api', message: 'Invalid monday.com item id.' }
  }
  try {
    const run = connectedRunner()
    if (!run) {
      return { ok: false, kind: 'not-connected', message: '' }
    }
    return { ok: true, updates: await fetchMondayItemUpdates(run, itemId) }
  } catch (error) {
    return toFailure(error)
  }
}

function normalizePreferences(value: unknown): MondayPreferencesUpdate {
  const record = typeof value === 'object' && value !== null ? { ...value } : {}
  const update: MondayPreferencesUpdate = {}
  if ('selectedPersonIds' in record) {
    update.selectedPersonIds =
      record.selectedPersonIds === null
        ? null
        : (normalizeIdList(record.selectedPersonIds) ?? undefined)
  }
  if ('selectedBoardIds' in record) {
    update.selectedBoardIds =
      record.selectedBoardIds === null
        ? null
        : (normalizeIdList(record.selectedBoardIds) ?? undefined)
  }
  if ('boardSettings' in record) {
    update.boardSettings = parseMondayBoardDisplaySettings(record.boardSettings)
  }
  if ('showDone' in record && typeof record.showDone === 'boolean') {
    update.showDone = record.showDone
  }
  if ('undatedExpanded' in record && typeof record.undatedExpanded === 'boolean') {
    update.undatedExpanded = record.undatedExpanded
  }
  if ('activeTab' in record && (record.activeTab === 'calendar' || record.activeTab === 'docs')) {
    update.activeTab = record.activeTab
  }
  return update
}

export function registerMondayHandlers(): void {
  ipcMain.handle('monday:status', () => getMondayConnectionStatus())
  ipcMain.handle('monday:connect', (_event, args: unknown) => connect(args))
  ipcMain.handle('monday:disconnect', () => clearMondayConnection())
  ipcMain.handle('monday:fetchItemUpdates', (_event, args: unknown) => fetchItemUpdates(args))
  ipcMain.handle('monday:fetchDocs', () => fetchDocs())
  ipcMain.handle('monday:fetchDocContent', (_event, args: unknown) => fetchDocContent(args))
  ipcMain.handle('monday:updatePreferences', (_event, args: unknown) =>
    updateMondayPreferences(normalizePreferences(args))
  )
  // Why: page re-entry while a refresh is running reuses it instead of spending more daily API calls;
  // keyed by boards so a fetch started before a board edit can't answer for the new boards.
  ipcMain.handle('monday:fetchCalendar', () => {
    const boardKey = getMondayConnectionStatus().boardIds.join(',')
    if (inFlightFetch?.boardKey !== boardKey) {
      const entry = {
        boardKey,
        promise: fetchCalendar().finally(() => {
          if (inFlightFetch === entry) {
            inFlightFetch = null
          }
        })
      }
      inFlightFetch = entry
    }
    return inFlightFetch.promise
  })
}
