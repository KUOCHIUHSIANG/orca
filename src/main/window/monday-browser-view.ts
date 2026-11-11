import { WebContentsView, type BrowserWindow } from 'electron'
import { installDetachedPageInput } from './detached-page-window-input'
import { openExternalUrlInFrontBrowserWindow } from '../external-link-chromium-front-window'
import { stepUIZoomLevel, type UIZoomDirection } from '../../shared/ui-zoom-level'
import { normalizeExternalBrowserUrl } from '../../shared/browser-url'
import type { KeybindingOverrides } from '../../shared/keybindings'
import type { MondayBrowserAction, MondayBrowserState } from '../../shared/detached-pages'

/** The toolbar the window's own renderer draws above the page; its zoom stays fixed so this holds. */
export const MONDAY_BROWSER_TOOLBAR_HEIGHT = 40

type MondayBrowser = { window: BrowserWindow; view: WebContentsView }

let current: MondayBrowser | null = null

const EMPTY_STATE: MondayBrowserState = {
  url: null,
  title: '',
  canGoBack: false,
  canGoForward: false,
  loading: false
}

function liveBrowser(): MondayBrowser | null {
  return current && !current.window.isDestroyed() && !current.view.webContents.isDestroyed()
    ? current
    : null
}

export function mondayBrowserState(): MondayBrowserState {
  const browser = liveBrowser()
  if (!browser) {
    return EMPTY_STATE
  }
  const contents = browser.view.webContents
  const url = contents.getURL()
  return {
    url: url || null,
    title: contents.getTitle(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    loading: contents.isLoading()
  }
}

function publishState(browser: MondayBrowser): void {
  if (!browser.window.isDestroyed() && !browser.window.webContents.isDestroyed()) {
    browser.window.webContents.send('detachedPages:mondayBrowserState', mondayBrowserState())
  }
}

function layout(browser: MondayBrowser): void {
  const [width, height] = browser.window.getContentSize()
  browser.view.setBounds({
    x: 0,
    y: MONDAY_BROWSER_TOOLBAR_HEIGHT,
    width,
    height: Math.max(0, height - MONDAY_BROWSER_TOOLBAR_HEIGHT)
  })
}

function sameSite(url: string, pageUrl: string): boolean {
  try {
    return new URL(url).host === new URL(pageUrl).host
  } catch {
    return false
  }
}

function isBackShortcut(input: Electron.Input): boolean {
  return process.platform === 'darwin'
    ? input.meta && !input.shift && input.key === '['
    : input.alt && input.key === 'ArrowLeft'
}

function isForwardShortcut(input: Electron.Input): boolean {
  return process.platform === 'darwin'
    ? input.meta && !input.shift && input.key === ']'
    : input.alt && input.key === 'ArrowRight'
}

function isReloadShortcut(input: Electron.Input): boolean {
  const modifier = process.platform === 'darwin' ? input.meta : input.control
  return (modifier && !input.alt && input.key.toLowerCase() === 'r') || input.key === 'F5'
}

/**
 * Puts a monday.com page under the task window's toolbar, in Orca's own browser session so
 * Orca's browser login, Chrome identity and site permissions carry over. No preload: the page
 * gets none of Orca's privileges.
 */
export function attachMondayBrowserView(
  window: BrowserWindow,
  getKeybindings: () => KeybindingOverrides | undefined,
  options: { partition: string; initialUrl: string | null }
): (direction: UIZoomDirection) => void {
  const view = new WebContentsView({
    webPreferences: {
      partition: options.partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  const browser: MondayBrowser = { window, view }
  current = browser
  window.contentView.addChildView(view)
  layout(browser)
  view.setVisible(false)
  window.on('resize', () => layout(browser))

  const contents = view.webContents
  contents.setWindowOpenHandler(({ url, features, frameName }) => {
    // Sized or named popups are sign-in flows (Google, Microsoft) that report back to this page,
    // so they open in the same session, as Orca's browser does.
    if ((features || frameName) && /^https:\/\//i.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            session: contents.session,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
          }
        }
      }
    }
    // Links to monday stay in this window; anything else goes to the system browser.
    if (sameSite(url, contents.getURL())) {
      void contents.loadURL(url)
    } else {
      const external = normalizeExternalBrowserUrl(url)
      if (external) {
        void openExternalUrlInFrontBrowserWindow(external)
      }
    }
    return { action: 'deny' }
  })
  contents.on('did-create-window', (popup) => {
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
  contents.on('will-navigate', (event, url) => {
    if (!/^https?:/i.test(url)) {
      event.preventDefault()
    }
  })
  const publish = (): void => publishState(browser)
  contents.on('did-start-loading', publish)
  contents.on('did-stop-loading', publish)
  contents.on('did-navigate', publish)
  contents.on('did-navigate-in-page', publish)
  contents.on('page-title-updated', publish)

  const zoom = (direction: UIZoomDirection): void => {
    if (!contents.isDestroyed()) {
      contents.setZoomLevel(stepUIZoomLevel(contents.getZoomLevel(), direction))
    }
  }
  installDetachedPageInput(window, getKeybindings, {
    contents,
    zoom,
    onKeyDown: (input) => {
      const action: MondayBrowserAction | null = isBackShortcut(input)
        ? 'back'
        : isForwardShortcut(input)
          ? 'forward'
          : isReloadShortcut(input)
            ? 'reload'
            : null
      if (action) {
        runMondayBrowserAction(action)
      }
      return action !== null
    }
  })

  window.on('closed', () => {
    if (current === browser) {
      current = null
    }
    if (!contents.isDestroyed()) {
      contents.close()
    }
  })

  if (options.initialUrl) {
    showMondayBrowserUrl(options.initialUrl)
  }
  return zoom
}

/** Loads a monday.com page; false when the URL isn't a web page or no task window is open. */
export function showMondayBrowserUrl(url: string): boolean {
  const browser = liveBrowser()
  if (!browser || !/^https:\/\//i.test(url)) {
    return false
  }
  browser.view.setVisible(true)
  void browser.view.webContents.loadURL(url)
  return true
}

export function runMondayBrowserAction(action: MondayBrowserAction): void {
  const browser = liveBrowser()
  if (!browser) {
    return
  }
  const contents = browser.view.webContents
  const history = contents.navigationHistory
  if (action === 'back' && history.canGoBack()) {
    history.goBack()
  } else if (action === 'forward' && history.canGoForward()) {
    history.goForward()
  } else if (action === 'reload') {
    contents.reload()
  } else if (action === 'stop') {
    contents.stop()
  } else if (action === 'openExternal') {
    const external = normalizeExternalBrowserUrl(contents.getURL())
    if (external) {
      void openExternalUrlInFrontBrowserWindow(external)
    }
  }
}
