import { ipcRenderer } from 'electron'
import type { ForkSyncApi } from './fork-sync-api'

export const forkSyncApi: ForkSyncApi = {
  getSummary: () => ipcRenderer.invoke('forkSync:getSummary'),
  dismissSummary: (id) => ipcRenderer.invoke('forkSync:dismissSummary', id)
}
