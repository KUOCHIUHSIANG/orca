import { ipcRenderer } from 'electron'
import type { ForkBuildProgress } from '../../shared/fork-build-progress-types'
import type { ForkSyncApi } from './fork-sync-api'

export const forkSyncApi: ForkSyncApi = {
  getSummary: () => ipcRenderer.invoke('forkSync:getSummary'),
  dismissSummary: (id) => ipcRenderer.invoke('forkSync:dismissSummary', id),
  getBuildProgress: () => ipcRenderer.invoke('forkSync:getBuildProgress'),
  onBuildProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ForkBuildProgress | null) =>
      callback(progress)
    ipcRenderer.on('forkSync:buildProgress', listener)
    return () => ipcRenderer.removeListener('forkSync:buildProgress', listener)
  }
}
