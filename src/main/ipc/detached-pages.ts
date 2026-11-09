import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainEvent, type WebContents } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import type { KeybindingService } from '../keybindings/keybinding-service'
import {
  closeDetachedPage,
  getDetachedPageWindow,
  installDetachedPagesQuitHandling,
  isDetachedPageRenderer,
  listDetachedPageWindows,
  listOpenDetachedPages,
  onDetachedPagesChanged,
  openDetachedPage,
  restoreDetachedPages,
  type DetachedPageWindowOptions
} from '../window/detached-page-window'
import { safelyRevealWindow } from '../window/focus-existing-window'
import {
  getTrustedUIRendererWebContents,
  getTrustedUIRendererWindow,
  isTrustedUIRenderer
} from './ui'
import {
  isDetachedPage,
  isDetachedPagesBroadcastTopic,
  isMainWindowCall,
  isMondayTaskSelection,
  MAIN_WINDOW_REVEALING_CALLS,
  type MainWindowCall,
  type MondayTaskSelection
} from '../../shared/detached-pages'

// Why: launching Claude can wait on agent detection for a remote host.
const MAIN_WINDOW_CALL_TIMEOUT_MS = 30_000

type MainWindowReply = { requestId: string } & (
  | { ok: true; value: unknown }
  | { ok: false; error: string }
)

let offPagesChanged: (() => void) | null = null
let lastMondayTask: MondayTaskSelection | null = null
/** Set when the task window is moved back, so the calendar keeps that task open in its panel. */
let dockedMondayTaskItemId: string | null = null

function isOrcaPageRenderer(sender: WebContents): boolean {
  return isTrustedUIRenderer(sender) || isDetachedPageRenderer(sender)
}

function pageRenderers(): WebContents[] {
  const main = getTrustedUIRendererWebContents()
  return [...(main ? [main] : []), ...listDetachedPageWindows().map((window) => window.webContents)]
}

function sendToPageRenderers(channel: string, payload: unknown, except?: WebContents): void {
  for (const contents of pageRenderers()) {
    if (contents !== except && !contents.isDestroyed()) {
      contents.send(channel, payload)
    }
  }
}

function revealMainWindow(): void {
  const mainWindow = getTrustedUIRendererWindow()
  if (mainWindow) {
    safelyRevealWindow(mainWindow)
  }
}

/** Runs `call` in the main window's renderer and resolves with its answer. */
function callMainWindow(call: MainWindowCall): Promise<unknown> {
  const renderer = getTrustedUIRendererWebContents()
  if (!renderer) {
    return Promise.reject(new Error('main_window_unavailable'))
  }
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const finish = (settle: () => void): void => {
      clearTimeout(timeout)
      ipcMain.removeListener('detachedPages:mainWindowReply', onReply)
      settle()
    }
    const timeout = setTimeout(
      () => finish(() => reject(new Error('main_window_call_timeout'))),
      MAIN_WINDOW_CALL_TIMEOUT_MS
    )
    const onReply = (event: IpcMainEvent, reply: MainWindowReply): void => {
      // Request ids grant no authority; only the targeted window may answer.
      if (event.sender !== renderer || reply?.requestId !== requestId) {
        return
      }
      finish(() => (reply.ok ? resolve(reply.value) : reject(new Error(reply.error))))
    }
    ipcMain.on('detachedPages:mainWindowReply', onReply)
    renderer.send('detachedPages:mainWindowCall', { requestId, call })
  })
}

const CHANNELS = [
  'detachedPages:list',
  'detachedPages:open',
  'detachedPages:dock',
  'detachedPages:restore',
  'detachedPages:showMondayTask',
  'detachedPages:currentMondayTask',
  'detachedPages:callMainWindow',
  'detachedPages:broadcast'
]

export function registerDetachedPagesHandlers(
  store: Store | null,
  keybindings?: KeybindingService
): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  installDetachedPagesQuitHandling()
  const windowOptions: DetachedPageWindowOptions = {
    store,
    getKeybindings: () => keybindings?.getOverrides()
  }

  offPagesChanged?.()
  offPagesChanged = onDetachedPagesChanged(({ open, closed }) => {
    // Sent before the open list so the calendar drops its selection before its panel returns.
    if (closed === 'monday-task') {
      sendToPageRenderers('detachedPages:mondayTaskClosed', { keepItemId: dockedMondayTaskItemId })
      dockedMondayTaskItemId = null
    }
    sendToPageRenderers('detachedPages:changed', open)
  })

  ipcMain.handle('detachedPages:list', (event) =>
    isOrcaPageRenderer(event.sender) ? listOpenDetachedPages() : []
  )

  ipcMain.handle('detachedPages:open', (event, page: unknown): void => {
    if (isOrcaPageRenderer(event.sender) && isDetachedPage(page)) {
      openDetachedPage(page, windowOptions)
    }
  })

  ipcMain.handle('detachedPages:dock', (event, page: unknown): void => {
    if (!isOrcaPageRenderer(event.sender) || !isDetachedPage(page)) {
      return
    }
    if (page === 'monday-task') {
      dockedMondayTaskItemId = lastMondayTask?.item.id ?? null
      closeDetachedPage(page)
      return
    }
    closeDetachedPage(page)
    getTrustedUIRendererWebContents()?.send('detachedPages:docked', page)
    if (!isTrustedUIRenderer(event.sender)) {
      revealMainWindow()
    }
  })

  ipcMain.handle('detachedPages:restore', (event): void => {
    if (isTrustedUIRenderer(event.sender)) {
      restoreDetachedPages(windowOptions)
    }
  })

  ipcMain.handle(
    'detachedPages:showMondayTask',
    (event, selection: unknown, options: unknown): void => {
      if (!isOrcaPageRenderer(event.sender) || !isMondayTaskSelection(selection)) {
        return
      }
      lastMondayTask = selection
      if (typeof options === 'object' && options !== null && 'open' in options && options.open) {
        openDetachedPage('monday-task', windowOptions)
      }
      getDetachedPageWindow('monday-task')?.webContents.send('detachedPages:mondayTask', selection)
    }
  )

  ipcMain.handle('detachedPages:currentMondayTask', (event) =>
    isDetachedPageRenderer(event.sender) ? lastMondayTask : null
  )

  ipcMain.handle('detachedPages:callMainWindow', async (event, call: unknown) => {
    if (!isDetachedPageRenderer(event.sender) || !isMainWindowCall(call)) {
      throw new Error('invalid_main_window_call')
    }
    try {
      return await callMainWindow(call)
    } finally {
      if (MAIN_WINDOW_REVEALING_CALLS.has(call.action)) {
        revealMainWindow()
      }
    }
  })

  ipcMain.handle('detachedPages:broadcast', (event, topic: unknown, payload: unknown): void => {
    if (isOrcaPageRenderer(event.sender) && isDetachedPagesBroadcastTopic(topic)) {
      sendToPageRenderers('detachedPages:broadcast', { topic, payload }, event.sender)
    }
  })
}
