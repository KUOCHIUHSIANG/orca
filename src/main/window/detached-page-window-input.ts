import { Menu, type BrowserWindow, type WebContents } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import { buildEditableContextMenuTemplate } from './editable-context-menu'
import { stepUIZoomLevel, type UIZoomDirection } from '../../shared/ui-zoom-level'
import { nativeZoomCommandMatchesKeybindings } from '../../shared/window-shortcut-policy'
import {
  keybindingMatchesAction,
  type KeybindingActionId,
  type KeybindingInput,
  type KeybindingOverrides
} from '../../shared/keybindings'

const ZOOM_SHORTCUTS: readonly [KeybindingActionId, UIZoomDirection][] = [
  ['zoom.in', 'in'],
  ['zoom.out', 'out'],
  ['zoom.reset', 'reset']
]

// Mirrors the dashboard popout: these windows have no renderer shortcut routing of their own.
function resolveZoomShortcut(
  input: KeybindingInput,
  keybindings: KeybindingOverrides | undefined
): UIZoomDirection | null {
  for (const [actionId, direction] of ZOOM_SHORTCUTS) {
    if (
      keybindingMatchesAction(actionId, input, process.platform, keybindings, { context: 'app' })
    ) {
      return direction
    }
  }
  return null
}

function isCloseWindowShortcut(input: Electron.Input): boolean {
  const modifier = process.platform === 'darwin' ? input.meta : input.control
  return modifier && !input.alt && !input.shift && input.key.toLowerCase() === 'w'
}

export function zoomDetachedPageWindow(window: BrowserWindow, direction: UIZoomDirection): void {
  const contents = window.webContents
  contents.setZoomLevel(stepUIZoomLevel(contents.getZoomLevel(), direction))
}

/** Starts at the app's zoom and follows app-wide changes; returns the unsubscribe. */
export function followAppZoom(window: BrowserWindow, store: Store | null): () => void {
  window.webContents.on('dom-ready', () => {
    if (!window.isDestroyed()) {
      window.webContents.setZoomLevel(store?.getUI().uiZoomLevel ?? 0)
    }
  })
  let lastFollowedZoomLevel = store?.getUI().uiZoomLevel ?? 0
  const off = store?.onUIChanged((ui) => {
    const level = ui.uiZoomLevel ?? 0
    if (level !== lastFollowedZoomLevel && !window.isDestroyed()) {
      lastFollowedZoomLevel = level
      window.webContents.setZoomLevel(level)
    }
  })
  return () => off?.()
}

/** Close and zoom shortcuts plus the inputs' Cut/Copy/Paste menu, as in the main window. */
export function installDetachedPageInput(
  window: BrowserWindow,
  getKeybindings: () => KeybindingOverrides | undefined,
  options: {
    /** Defaults to the window's own renderer. */
    contents?: WebContents
    zoom?: (direction: UIZoomDirection) => void
    /** Extra shortcuts; return true when handled. */
    onKeyDown?: (input: Electron.Input) => boolean
  } = {}
): void {
  const contents = options.contents ?? window.webContents
  const zoom = options.zoom ?? ((direction) => zoomDetachedPageWindow(window, direction))
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return
    }
    if (isCloseWindowShortcut(input)) {
      event.preventDefault()
      window.close()
      return
    }
    if (options.onKeyDown?.(input)) {
      event.preventDefault()
      return
    }
    const direction = resolveZoomShortcut(input, getKeybindings())
    if (direction) {
      event.preventDefault()
      zoom(direction)
    }
  })
  contents.on('zoom-changed', (event, direction) => {
    if (
      (direction === 'in' || direction === 'out') &&
      nativeZoomCommandMatchesKeybindings(direction, process.platform, getKeybindings(), {
        context: 'app'
      })
    ) {
      event.preventDefault()
      zoom(direction)
    }
  })
  contents.on('context-menu', (_event, params) => {
    const template = buildEditableContextMenuTemplate(params, contents, { plainText: true })
    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({ window })
    }
  })
}
