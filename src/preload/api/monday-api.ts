import type {
  MondayCalendarFetchResult,
  MondayCalendarSnapshot,
  MondayConnectArgs,
  MondayConnectResult,
  MondayConnectionStatus,
  MondayDocContentResult,
  MondayDocListResult,
  MondayItemUpdatesResult,
  MondayPreferencesUpdate
} from '../../shared/monday-calendar-types'
import type {
  MondayMarkNotificationsReadArgs,
  MondayNotificationsState
} from '../../shared/monday-notification-types'
import type { TaiwanHolidaysResult } from '../../shared/taiwan-holiday-types'

export type MondayApi = {
  status: () => Promise<MondayConnectionStatus>
  connect: (args: MondayConnectArgs) => Promise<MondayConnectResult>
  disconnect: () => Promise<void>
  updatePreferences: (update: MondayPreferencesUpdate) => Promise<void>
  fetchCalendar: () => Promise<MondayCalendarFetchResult>
  /** The last calendar saved on disk for the current boards, or null. */
  cachedCalendar: () => Promise<MondayCalendarSnapshot | null>
  fetchItemUpdates: (args: { itemId: string }) => Promise<MondayItemUpdatesResult>
  fetchDocs: () => Promise<MondayDocListResult>
  fetchDocContent: (args: { docId: string }) => Promise<MondayDocContentResult>
  fetchTaiwanHolidays: () => Promise<TaiwanHolidaysResult>
  notifications: () => Promise<MondayNotificationsState>
  refreshNotifications: () => Promise<MondayNotificationsState>
  markNotificationsRead: (
    args: MondayMarkNotificationsReadArgs
  ) => Promise<MondayNotificationsState>
  onNotificationsChanged: (callback: (state: MondayNotificationsState) => void) => () => void
}
