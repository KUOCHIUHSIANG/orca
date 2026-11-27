import type { BrowserWindow } from 'electron'
import { getTrustedUIRendererWindow } from '../ipc/ui'
import { getDetachedPageWindow } from '../window/detached-page-window'

/** The window showing the Servers page: its own window once moved out, else the main one. */
export function serverFilesHostWindow(): BrowserWindow | null {
  return getDetachedPageWindow('servers') ?? getTrustedUIRendererWindow()
}

/** Sends to the Servers page's window; false when it has no live document. */
export function publishToServerFilesHost(channel: string, payload?: unknown): boolean {
  const win = serverFilesHostWindow()
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return false
  }
  win.webContents.send(channel, payload)
  return true
}
