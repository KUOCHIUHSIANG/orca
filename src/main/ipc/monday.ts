import { ipcMain } from 'electron'
import {
  clearMondayConnection,
  getMondayConnectionStatus,
  loadMondayToken,
  saveMondayConnection,
  updateMondayPreferences
} from '../monday/monday-credential-store'
import { verifyMondayAccess } from '../monday/monday-access-verification'
import {
  clearMondayCalendarCache,
  readMondayCalendarCache,
  saveMondayCalendarCache
} from '../monday/monday-calendar-cache'
import { fetchMondayCalendarSnapshot } from '../monday/monday-calendar-fetch'
import { fetchMondayDocList, fetchMondayDocMarkdown } from '../monday/monday-docs'
import { createMondayQueryRunner, toMondayFailure } from '../monday/monday-graphql-client'
import { fetchMondayItemUpdates } from '../monday/monday-item-updates'
import {
  getMondayNotificationsState,
  markMondayNotificationsRead,
  onMondayNotificationsChanged,
  refreshMondayNotifications,
  syncMondayNotificationSession
} from '../monday/monday-notification-poller'
import { getTaiwanHolidays } from '../monday/taiwan-holidays'
import {
  parseMondayBoardDisplaySettings,
  type MondayCalendarFetchResult,
  type MondayConnectResult,
  type MondayDocContentResult,
  type MondayDocListResult,
  type MondayItemUpdatesResult,
  type MondayPreferencesUpdate
} from '../../shared/monday-calendar-types'
import type { MondayMarkNotificationsReadArgs } from '../../shared/monday-notification-types'
import { sendToPageRenderers } from './detached-pages'

function resyncNotifications(): void {
  syncMondayNotificationSession().catch((error: unknown) =>
    console.error('[monday] notification session sync failed:', error)
  )
}

let inFlightFetch: { boardKey: string; promise: Promise<MondayCalendarFetchResult> } | null = null

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
    const previousBoardKey = (await getMondayConnectionStatus()).boardIds.join(',')
    await saveMondayConnection({ apiToken, ...access })
    if (access.boardIds.join(',') !== previousBoardKey) {
      await clearMondayCalendarCache()
    }
    resyncNotifications()
    return { ok: true, status: await getMondayConnectionStatus() }
  } catch (error) {
    return toMondayFailure(error)
  }
}

async function fetchCalendar(): Promise<MondayCalendarFetchResult> {
  const status = await getMondayConnectionStatus()
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
    saveMondayCalendarCache(status.boardIds.join(','), snapshot).catch((error: unknown) =>
      console.warn('[monday] calendar cache write failed:', error)
    )
    return { ok: true, snapshot }
  } catch (error) {
    return toMondayFailure(error)
  }
}

async function connectedRunner(): Promise<ReturnType<typeof createMondayQueryRunner> | null> {
  const token = (await getMondayConnectionStatus()).connected ? loadMondayToken() : null
  return token ? createMondayQueryRunner(token) : null
}

async function fetchDocs(): Promise<MondayDocListResult> {
  try {
    const run = await connectedRunner()
    if (!run) {
      return { ok: false, kind: 'not-connected', message: '' }
    }
    const objectIds = (await getMondayConnectionStatus()).docs.map((doc) => doc.objectId)
    return { ok: true, docs: await fetchMondayDocList(run, objectIds) }
  } catch (error) {
    return toMondayFailure(error)
  }
}

async function fetchDocContent(args: unknown): Promise<MondayDocContentResult> {
  const record = typeof args === 'object' && args !== null ? { ...args } : {}
  const docId = 'docId' in record ? record.docId : null
  if (typeof docId !== 'string' || !/^\d+$/.test(docId)) {
    return { ok: false, kind: 'api', message: 'Invalid monday.com doc id.' }
  }
  try {
    const run = await connectedRunner()
    if (!run) {
      return { ok: false, kind: 'not-connected', message: '' }
    }
    return { ok: true, markdown: await fetchMondayDocMarkdown(run, docId) }
  } catch (error) {
    return toMondayFailure(error)
  }
}

async function fetchItemUpdates(args: unknown): Promise<MondayItemUpdatesResult> {
  const record = typeof args === 'object' && args !== null ? { ...args } : {}
  const itemId = 'itemId' in record ? record.itemId : null
  if (typeof itemId !== 'string' || !/^\d+$/.test(itemId)) {
    return { ok: false, kind: 'api', message: 'Invalid monday.com item id.' }
  }
  try {
    const run = await connectedRunner()
    if (!run) {
      return { ok: false, kind: 'not-connected', message: '' }
    }
    return { ok: true, updates: await fetchMondayItemUpdates(run, itemId) }
  } catch (error) {
    return toMondayFailure(error)
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
  if ('showTaiwanHolidays' in record && typeof record.showTaiwanHolidays === 'boolean') {
    update.showTaiwanHolidays = record.showTaiwanHolidays
  }
  if (
    'notifyPersonId' in record &&
    (record.notifyPersonId === null ||
      (typeof record.notifyPersonId === 'string' && /^\d+$/.test(record.notifyPersonId)))
  ) {
    update.notifyPersonId = record.notifyPersonId
  }
  return update
}

function normalizeMarkReadArgs(value: unknown): MondayMarkNotificationsReadArgs | null {
  const record = typeof value === 'object' && value !== null ? { ...value } : {}
  if ('all' in record && record.all === true) {
    return { all: true }
  }
  const ids = 'ids' in record && Array.isArray(record.ids) ? record.ids : null
  return ids?.every((id) => typeof id === 'string') ? { ids } : null
}

export function registerMondayHandlers(): void {
  ipcMain.handle('monday:status', () => getMondayConnectionStatus())
  ipcMain.handle('monday:connect', (_event, args: unknown) => connect(args))
  ipcMain.handle('monday:disconnect', async () => {
    await clearMondayConnection()
    await clearMondayCalendarCache()
    resyncNotifications()
  })
  // Why: paints the last calendar at once after a restart while the real fetch runs.
  ipcMain.handle('monday:cachedCalendar', async () => {
    const status = await getMondayConnectionStatus()
    return status.connected ? readMondayCalendarCache(status.boardIds.join(',')) : null
  })
  ipcMain.handle('monday:fetchItemUpdates', (_event, args: unknown) => fetchItemUpdates(args))
  ipcMain.handle('monday:fetchDocs', () => fetchDocs())
  // Why: public government data, so it needs neither the monday token nor a connection.
  ipcMain.handle('monday:fetchTaiwanHolidays', () => getTaiwanHolidays())
  ipcMain.handle('monday:fetchDocContent', (_event, args: unknown) => fetchDocContent(args))
  ipcMain.handle('monday:updatePreferences', async (_event, args: unknown) => {
    const update = normalizePreferences(args)
    await updateMondayPreferences(update)
    if (update.notifyPersonId !== undefined) {
      resyncNotifications()
    }
  })
  ipcMain.handle('monday:notifications', () => getMondayNotificationsState())
  ipcMain.handle('monday:refreshNotifications', () => refreshMondayNotifications())
  ipcMain.handle('monday:markNotificationsRead', (_event, args: unknown) => {
    const normalized = normalizeMarkReadArgs(args)
    return normalized ? markMondayNotificationsRead(normalized) : getMondayNotificationsState()
  })
  // Why: the poller runs in main so the sidebar badge and a popped-out Monday window share one feed.
  onMondayNotificationsChanged((state) => sendToPageRenderers('monday:notificationsChanged', state))
  resyncNotifications()
  // Why: page re-entry while a refresh is running reuses it instead of spending more daily API calls;
  // keyed by boards so a fetch started before a board edit can't answer for the new boards.
  ipcMain.handle('monday:fetchCalendar', async () => {
    const boardKey = (await getMondayConnectionStatus()).boardIds.join(',')
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
