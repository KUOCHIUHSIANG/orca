import { ipcRenderer } from 'electron'
import type { DetachedPagesApi } from './detached-pages-api'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

export const detachedPagesApi: DetachedPagesApi = {
  list: () => ipcRenderer.invoke('detachedPages:list'),
  open: (page) => ipcRenderer.invoke('detachedPages:open', page),
  dock: (page) => ipcRenderer.invoke('detachedPages:dock', page),
  restore: () => ipcRenderer.invoke('detachedPages:restore'),
  onChanged: (callback) => subscribe('detachedPages:changed', callback),
  onDocked: (callback) => subscribe('detachedPages:docked', callback),
  showMondayTask: (selection, options) =>
    ipcRenderer.invoke('detachedPages:showMondayTask', selection, options),
  mondayBrowserState: () => ipcRenderer.invoke('detachedPages:mondayBrowserState'),
  onMondayBrowserState: (callback) => subscribe('detachedPages:mondayBrowserState', callback),
  mondayBrowser: (action) => ipcRenderer.invoke('detachedPages:mondayBrowser', action),
  onMondayTaskClosed: (callback) => subscribe('detachedPages:mondayTaskClosed', callback),
  callMainWindow: (call) => ipcRenderer.invoke('detachedPages:callMainWindow', call),
  onMainWindowCall: (callback) => subscribe('detachedPages:mainWindowCall', callback),
  replyMainWindowCall: (reply) => ipcRenderer.send('detachedPages:mainWindowReply', reply),
  broadcast: (topic, payload) => ipcRenderer.invoke('detachedPages:broadcast', topic, payload),
  onBroadcast: (callback) => subscribe('detachedPages:broadcast', callback)
}
