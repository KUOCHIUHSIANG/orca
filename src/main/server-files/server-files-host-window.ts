import type { BrowserWindow } from 'electron'
import { getCurrentMainWindow } from '../ipc/ssh/ssh-ipc-context'
import { getDetachedPageWindow } from '../window/detached-page-window'

/** The window showing the Servers page: its own window once moved out, else the main one. */
export function serverFilesHostWindow(): BrowserWindow | null {
  return getDetachedPageWindow('servers') ?? getCurrentMainWindow()
}
