import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { isTrustedMainRendererSender } from '../ipc/main-renderer-sender-trust'
import { isCompanionPageRenderer } from './companion-window-renderers'

let trustedClipboardRendererWebContentsId: number | null = null

export function setTrustedClipboardRendererWebContentsId(webContentsId: number | null): void {
  trustedClipboardRendererWebContentsId = webContentsId
}

export function assertTrustedClipboardSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedClipboardRenderer(event.sender)) {
    throw new Error('Unauthorized clipboard IPC sender')
  }
}

export function assertTrustedClipboardTextSender(event: IpcMainInvokeEvent): void {
  // Companion windows need text clipboard authority only; never extend it to images, files or remote operations.
  if (!isTrustedClipboardRenderer(event.sender) && !isCompanionPageRenderer(event.sender)) {
    throw new Error('Unauthorized clipboard IPC sender')
  }
}

function isTrustedClipboardRenderer(sender: WebContents): boolean {
  return isTrustedMainRendererSender(sender, trustedClipboardRendererWebContentsId)
}
