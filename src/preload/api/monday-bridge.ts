import { ipcRenderer } from 'electron'
import type { MondayApi } from './monday-api'

export const mondayApi: MondayApi = {
  status: () => ipcRenderer.invoke('monday:status'),
  connect: (args) => ipcRenderer.invoke('monday:connect', args),
  disconnect: () => ipcRenderer.invoke('monday:disconnect'),
  updatePreferences: (update) => ipcRenderer.invoke('monday:updatePreferences', update),
  fetchCalendar: () => ipcRenderer.invoke('monday:fetchCalendar'),
  fetchItemUpdates: (args) => ipcRenderer.invoke('monday:fetchItemUpdates', args),
  fetchDocs: () => ipcRenderer.invoke('monday:fetchDocs'),
  fetchDocContent: (args) => ipcRenderer.invoke('monday:fetchDocContent', args)
}
