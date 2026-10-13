import type {
  MondayCalendarFetchResult,
  MondayConnectArgs,
  MondayConnectResult,
  MondayConnectionStatus,
  MondayDocContentResult,
  MondayDocListResult,
  MondayItemUpdatesResult,
  MondayPreferencesUpdate
} from '../../shared/monday-calendar-types'

export type MondayApi = {
  status: () => Promise<MondayConnectionStatus>
  connect: (args: MondayConnectArgs) => Promise<MondayConnectResult>
  disconnect: () => Promise<void>
  updatePreferences: (update: MondayPreferencesUpdate) => Promise<void>
  fetchCalendar: () => Promise<MondayCalendarFetchResult>
  fetchItemUpdates: (args: { itemId: string }) => Promise<MondayItemUpdatesResult>
  fetchDocs: () => Promise<MondayDocListResult>
  fetchDocContent: (args: { docId: string }) => Promise<MondayDocContentResult>
}
