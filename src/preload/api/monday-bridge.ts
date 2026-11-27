import { ipcRenderer } from 'electron'
import type { MondayNotificationsState } from '../../shared/monday-notification-types'
import type { MondayApi } from './monday-api'

export const mondayApi: MondayApi = {
  status: () => ipcRenderer.invoke('monday:status'),
  connect: (args) => ipcRenderer.invoke('monday:connect', args),
  disconnect: () => ipcRenderer.invoke('monday:disconnect'),
  updatePreferences: (update) => ipcRenderer.invoke('monday:updatePreferences', update),
  fetchCalendar: () => ipcRenderer.invoke('monday:fetchCalendar'),
  cachedCalendar: () => ipcRenderer.invoke('monday:cachedCalendar'),
  fetchItemUpdates: (args) => ipcRenderer.invoke('monday:fetchItemUpdates', args),
  fetchDocs: () => ipcRenderer.invoke('monday:fetchDocs'),
  fetchDocContent: (args) => ipcRenderer.invoke('monday:fetchDocContent', args),
  fetchTaiwanHolidays: () => ipcRenderer.invoke('monday:fetchTaiwanHolidays'),
  notifications: () => ipcRenderer.invoke('monday:notifications'),
  refreshNotifications: () => ipcRenderer.invoke('monday:refreshNotifications'),
  markNotificationsRead: (args) => ipcRenderer.invoke('monday:markNotificationsRead', args),
  onNotificationsChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: MondayNotificationsState): void =>
      callback(state)
    ipcRenderer.on('monday:notificationsChanged', listener)
    return () => ipcRenderer.removeListener('monday:notificationsChanged', listener)
  }
}
