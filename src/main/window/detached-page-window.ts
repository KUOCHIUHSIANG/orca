import { app, BrowserWindow, nativeTheme, type WebContents } from 'electron'
import { join } from 'node:path'
import type { Store } from '../persistence/loading-store/store'
import {
  followAppZoom,
  installDetachedPageInput,
  zoomDetachedPageWindow
} from './detached-page-window-input'
import {
  isWindowlessLaunch,
  isBackgroundLaunch,
  showWindowWithoutStealingFocus
} from './foreground-activation-policy'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { rectHasVisibleAreaOnAnyDisplay } from './window-bounds-validation'
import { attachMondayBrowserView } from './monday-browser-view'
import {
  readDetachedPageBounds,
  readMondayTaskUrl,
  readDetachedPagesToRestore,
  saveDetachedPageBounds,
  setDetachedPageRestorable
} from './detached-page-window-state'
import type { UIZoomDirection } from '../../shared/ui-zoom-level'
import type { KeybindingOverrides } from '../../shared/keybindings'
import { DETACHED_PAGES, type DetachedPage } from '../../shared/detached-pages'

type WindowSize = { width: number; height: number; minWidth: number; minHeight: number }

const PAGE_SIZES: Record<DetachedPage, WindowSize> = {
  monday: { width: 1200, height: 820, minWidth: 720, minHeight: 480 },
  todo: { width: 1200, height: 820, minWidth: 720, minHeight: 480 },
  servers: { width: 1280, height: 840, minWidth: 820, minHeight: 520 },
  'monday-task': { width: 1200, height: 860, minWidth: 640, minHeight: 420 }
}
// Why: its own session keeps zoom per window (Chromium shares zoom by origin); persist keeps localStorage.
const DETACHED_PAGES_PARTITION = 'persist:orca-detached-pages'
// Why: the task window's toolbar must never pick up another window's zoom, or the page below misaligns.
const MONDAY_TOOLBAR_PARTITION = 'orca-monday-browser-toolbar'
// Quit closes every window right after before-quit; a vetoed quit must not keep later closes.
const QUIT_CLOSE_GRACE_MS = 3000

export type DetachedPagesChange = { open: DetachedPage[]; closed: DetachedPage | null }

const windows = new Map<DetachedPage, BrowserWindow>()
const changeListeners = new Set<(change: DetachedPagesChange) => void>()
// Windows closing because Orca is quitting or its main window closed; they reopen next time.
const keepRestorable = new Set<BrowserWindow>()
const zoomTargets = new WeakMap<BrowserWindow, (direction: UIZoomDirection) => void>()
let quitGraceTimer: ReturnType<typeof setTimeout> | null = null

export type DetachedPageWindowOptions = {
  store: Store | null
  getKeybindings?: () => KeybindingOverrides | undefined
  /** Orca's browser session, which the Monday task window shows monday.com in. */
  mondayBrowserPartition?: () => string
}

function liveWindow(page: DetachedPage): BrowserWindow | null {
  const window = windows.get(page)
  return window && !window.isDestroyed() && !window.webContents.isDestroyed() ? window : null
}

export function getDetachedPageWindow(page: DetachedPage): BrowserWindow | null {
  return liveWindow(page)
}

export function detachedPageOfRenderer(sender: WebContents): DetachedPage | null {
  for (const page of DETACHED_PAGES) {
    if (liveWindow(page)?.webContents === sender) {
      return page
    }
  }
  return null
}

export function isDetachedPageRenderer(sender: WebContents): boolean {
  return detachedPageOfRenderer(sender) !== null
}

export function listOpenDetachedPages(): DetachedPage[] {
  return DETACHED_PAGES.filter((page) => liveWindow(page) !== null)
}

export function listDetachedPageWindows(): BrowserWindow[] {
  return DETACHED_PAGES.flatMap((page) => liveWindow(page) ?? [])
}

export function onDetachedPagesChanged(
  listener: (change: DetachedPagesChange) => void
): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

function emitChange(closed: DetachedPage | null): void {
  const change = { open: listOpenDetachedPages(), closed }
  for (const listener of changeListeners) {
    listener(change)
  }
}

/** Zoom the focused detached page; false lets the menu fall back to the main window. */
export function zoomDetachedPageIfFocused(direction: UIZoomDirection): boolean {
  const focused = listDetachedPageWindows().find((window) => window.isFocused())
  if (!focused) {
    return false
  }
  const zoom = zoomTargets.get(focused)
  if (zoom) {
    zoom(direction)
  } else {
    zoomDetachedPageWindow(focused, direction)
  }
  return true
}

function restoredBounds(
  page: DetachedPage
): { width: number; height: number; x?: number; y?: number } | null {
  const saved = readDetachedPageBounds(page)
  const { minWidth, minHeight } = PAGE_SIZES[page]
  if (!saved || saved.width < minWidth || saved.height < minHeight) {
    return null
  }
  // Why: a monitor that is gone now would strand the window; keep its size, let Electron center it.
  return rectHasVisibleAreaOnAnyDisplay(saved, minWidth / 2, minHeight / 2)
    ? saved
    : { width: saved.width, height: saved.height }
}

function loadPage(window: BrowserWindow, page: DetachedPage): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/detached-page.html?page=${page}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/detached-page.html'), { query: { page } })
  }
}

function persistBoundsOnMove(window: BrowserWindow, page: DetachedPage): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let frozen = false
  const save = (): void => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      if (frozen || window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
        return
      }
      saveDetachedPageBounds(page, window.getBounds())
    }, 500)
  }
  window.on('resize', save)
  window.on('move', save)
  return () => {
    // Teardown resizes must not replace the remembered bounds with minimum sizes.
    frozen = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
}

function createDetachedPageWindow(
  page: DetachedPage,
  options: DetachedPageWindowOptions
): BrowserWindow {
  const size = PAGE_SIZES[page]
  const saved = restoredBounds(page)
  const browserPartition = page === 'monday-task' ? options.mondayBrowserPartition?.() : undefined
  const window = new BrowserWindow({
    width: saved?.width ?? size.width,
    height: saved?.height ?? size.height,
    ...(saved?.x !== undefined ? { x: saved.x, y: saved.y } : {}),
    minWidth: size.minWidth,
    minHeight: size.minHeight,
    title: 'Orca',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      partition: browserPartition ? MONDAY_TOOLBAR_PARTITION : DETACHED_PAGES_PARTITION,
      webviewTag: false
    }
  })
  windows.set(page, window)
  installPrivilegedWindowNavigationPolicy(window.webContents)
  // Isolated sessions do not inherit the main session's deny-by-default permission policy.
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)

  const getKeybindings = (): KeybindingOverrides | undefined => options.getKeybindings?.()
  // The task window's toolbar keeps a fixed zoom; its zoom keys act on the monday.com page instead.
  const offAppZoom = browserPartition ? () => {} : followAppZoom(window, options.store)
  const zoom = browserPartition
    ? attachMondayBrowserView(window, getKeybindings, {
        partition: browserPartition,
        initialUrl: readMondayTaskUrl()
      })
    : (direction: UIZoomDirection): void => zoomDetachedPageWindow(window, direction)
  zoomTargets.set(window, zoom)
  installDetachedPageInput(window, getKeybindings, { zoom })

  const freezeBounds = persistBoundsOnMove(window, page)
  window.on('close', freezeBounds)
  // Why: 'closed', not 'close' — a renderer-initiated close skips the 'close' event.
  window.on('closed', () => {
    freezeBounds()
    if (!keepRestorable.delete(window)) {
      setDetachedPageRestorable(page, false)
    }
    offAppZoom()
    if (windows.get(page) === window) {
      windows.delete(page)
    }
    emitChange(page)
  })

  loadPage(window, page)
  return window
}

/** Opens the page's window, or brings back the one already open. */
export function openDetachedPage(
  page: DetachedPage,
  options: DetachedPageWindowOptions & { focus?: boolean }
): BrowserWindow {
  const existing = liveWindow(page)
  if (existing) {
    if (existing.webContents.isCrashed()) {
      existing.webContents.reload()
    }
    if (options.focus !== false) {
      if (existing.isMinimized()) {
        existing.restore()
      }
      if (!isBackgroundLaunch()) {
        existing.focus()
      }
    }
    return existing
  }
  const window = createDetachedPageWindow(page, options)
  setDetachedPageRestorable(page, true)
  window.once('ready-to-show', () => {
    if (options.focus === false) {
      if (!window.isDestroyed() && !isWindowlessLaunch()) {
        window.showInactive()
      }
      return
    }
    showWindowWithoutStealingFocus(window)
  })
  emitChange(null)
  return window
}

/** Reopens the windows that were open when Orca last quit, without taking focus. */
export function restoreDetachedPages(options: DetachedPageWindowOptions): void {
  for (const page of readDetachedPagesToRestore()) {
    if (!liveWindow(page)) {
      openDetachedPage(page, { ...options, focus: false })
    }
  }
}

/** The user moved the page back; it is not reopened on the next launch. */
export function closeDetachedPage(page: DetachedPage): void {
  liveWindow(page)?.close()
}

function markOpenWindowsRestorable(): void {
  for (const window of listDetachedPageWindows()) {
    keepRestorable.add(window)
  }
}

/** Close with the owning main window; they reopen with it. */
export function closeDetachedPagesWithMainWindow(): void {
  markOpenWindowsRestorable()
  for (const window of listDetachedPageWindows()) {
    window.close()
  }
}

let quitHandlingInstalled = false

export function installDetachedPagesQuitHandling(): void {
  if (quitHandlingInstalled) {
    return
  }
  quitHandlingInstalled = true
  app.on('before-quit', () => {
    markOpenWindowsRestorable()
    if (quitGraceTimer) {
      clearTimeout(quitGraceTimer)
    }
    quitGraceTimer = setTimeout(() => {
      quitGraceTimer = null
      keepRestorable.clear()
    }, QUIT_CLOSE_GRACE_MS)
  })
}
