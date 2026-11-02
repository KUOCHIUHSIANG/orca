import { ipcRenderer, webUtils } from 'electron'
import type { JobProgress } from '../../shared/server-files-types'
import type { ServerFilesApi } from './server-files-api'

export const serverFilesApi: ServerFilesApi = {
  listProfiles: () => ipcRenderer.invoke('serverFiles:listProfiles'),
  canSavePasswords: () => ipcRenderer.invoke('serverFiles:canSavePasswords'),
  saveProfile: (request) => ipcRenderer.invoke('serverFiles:saveProfile', request),
  deleteProfile: (args) => ipcRenderer.invoke('serverFiles:deleteProfile', args),
  connect: (args) => ipcRenderer.invoke('serverFiles:connect', args),
  disconnect: (args) => ipcRenderer.invoke('serverFiles:disconnect', args),
  list: (args) => ipcRenderer.invoke('serverFiles:list', args),
  mkdir: (args) => ipcRenderer.invoke('serverFiles:mkdir', args),
  rename: (args) => ipcRenderer.invoke('serverFiles:rename', args),
  planUpload: (args) => ipcRenderer.invoke('serverFiles:planUpload', args),
  planDownload: (args) => ipcRenderer.invoke('serverFiles:planDownload', args),
  executeTransfer: (request) => ipcRenderer.invoke('serverFiles:executeTransfer', request),
  planRemove: (args) => ipcRenderer.invoke('serverFiles:planRemove', args),
  executeRemove: (args) => ipcRenderer.invoke('serverFiles:executeRemove', args),
  planCopy: (request) => ipcRenderer.invoke('serverFiles:planCopy', request),
  executeCopy: (request) => ipcRenderer.invoke('serverFiles:executeCopy', request),
  discardPlan: (args) => ipcRenderer.invoke('serverFiles:discardPlan', args),
  cancelJob: (args) => ipcRenderer.invoke('serverFiles:cancelJob', args),
  terminalCommand: (args) => ipcRenderer.invoke('serverFiles:terminalCommand', args),
  pickLocal: (args) => ipcRenderer.invoke('serverFiles:pickLocal', args),
  localDefaults: () => ipcRenderer.invoke('serverFiles:localDefaults'),
  showInFolder: (args) => ipcRenderer.invoke('serverFiles:showInFolder', args),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: JobProgress): void =>
      callback(progress)
    ipcRenderer.on('serverFiles:progress', listener)
    return () => {
      ipcRenderer.removeListener('serverFiles:progress', listener)
    }
  }
}
