import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as DetachedPageWindowModule from './detached-page-window'

type Rect = { x: number; y: number; width: number; height: number }

const { instances, FakeWindow, electron } = vi.hoisted(() => {
  const created: FakeWindowType[] = []

  class FakeWindowType {
    options: Electron.BrowserWindowConstructorOptions
    destroyed = false
    bounds: Rect = { x: 2000, y: 100, width: 900, height: 700 }
    private handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
    webContents = {
      isDestroyed: () => this.destroyed,
      isCrashed: () => false,
      session: { setPermissionRequestHandler: () => {}, setPermissionCheckHandler: () => {} },
      on: () => {}
    }
    show = vi.fn()
    showInactive = vi.fn()
    focus = vi.fn()
    restore = vi.fn()
    loadURL = vi.fn()
    loadFile = vi.fn()
    close = vi.fn(() => {
      this.emit('close')
      this.destroyed = true
      this.emit('closed')
    })

    constructor(options: Electron.BrowserWindowConstructorOptions) {
      this.options = options
      created.push(this)
    }
    on(event: string, cb: (...args: unknown[]) => void): this {
      ;(this.handlers[event] ||= []).push(cb)
      return this
    }
    once(event: string, cb: (...args: unknown[]) => void): this {
      return this.on(event, cb)
    }
    emit(event: string, ...args: unknown[]): void {
      for (const cb of this.handlers[event] ?? []) {
        cb(...args)
      }
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    isMinimized(): boolean {
      return false
    }
    isFullScreen(): boolean {
      return false
    }
    getBounds(): Rect {
      return this.bounds
    }
  }

  const electronState: {
    userData: string
    appHandlers: Record<string, (() => void)[]>
    displays: { workArea: Rect }[]
  } = {
    userData: '',
    appHandlers: {},
    displays: [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
  }
  return { instances: created, FakeWindow: FakeWindowType, electron: electronState }
})

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getPath: () => electron.userData,
    on: (event: string, cb: () => void) => {
      ;(electron.appHandlers[event] ||= []).push(cb)
    }
  },
  BrowserWindow: FakeWindow,
  nativeTheme: { shouldUseDarkColors: false },
  screen: { getAllDisplays: () => electron.displays }
}))
vi.mock('./privileged-window-navigation', () => ({
  installPrivilegedWindowNavigationPolicy: () => {}
}))
vi.mock('./detached-page-window-input', () => ({
  followAppZoom: () => () => {},
  installDetachedPageInput: () => {},
  zoomDetachedPageWindow: () => {}
}))
vi.mock('./foreground-activation-policy', () => ({
  isBackgroundLaunch: () => false,
  isWindowlessLaunch: () => false,
  showWindowWithoutStealingFocus: (window: InstanceType<typeof FakeWindow>) => window.show()
}))

async function freshModule(): Promise<typeof DetachedPageWindowModule> {
  // A fresh import is a relaunch: nothing cached, state read back from disk.
  vi.resetModules()
  return import('./detached-page-window')
}

function lastWindow(): InstanceType<typeof FakeWindow> {
  return instances.at(-1)!
}

describe('detached page windows', () => {
  beforeEach(() => {
    electron.userData = mkdtempSync(join(tmpdir(), 'orca-detached-pages-'))
    instances.length = 0
    for (const key of Object.keys(electron.appHandlers)) {
      delete electron.appHandlers[key]
    }
    electron.displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
  })
  afterEach(() => {
    vi.useRealTimers()
    rmSync(electron.userData, { recursive: true, force: true })
  })

  it('reopens on the next launch only the windows the user did not close', async () => {
    const windows = await freshModule()
    windows.openDetachedPage('monday', { store: null })
    windows.openDetachedPage('servers', { store: null })
    windows.openDetachedPage('todo', { store: null })
    windows.closeDetachedPage('monday')
    // A close the page itself starts emits only 'closed'.
    const todoWindow = lastWindow()
    todoWindow.destroyed = true
    todoWindow.emit('closed')
    windows.closeDetachedPagesWithMainWindow()
    expect(windows.listOpenDetachedPages()).toEqual([])

    const relaunched = await freshModule()
    instances.length = 0
    relaunched.restoreDetachedPages({ store: null })
    expect(relaunched.listOpenDetachedPages()).toEqual(['servers'])
    lastWindow().emit('ready-to-show')
    // Restored windows must not pull focus away from the main window.
    expect(lastWindow().showInactive).toHaveBeenCalled()
    expect(lastWindow().show).not.toHaveBeenCalled()
  })

  it('keeps windows that close during quit, but not after a quit was called off', async () => {
    vi.useFakeTimers()
    const windows = await freshModule()
    windows.installDetachedPagesQuitHandling()
    windows.openDetachedPage('todo', { store: null })
    windows.openDetachedPage('monday', { store: null })
    const [todoWindow, mondayWindow] = instances

    for (const beforeQuit of electron.appHandlers['before-quit'] ?? []) {
      beforeQuit()
    }
    todoWindow.close()
    // The quit was vetoed; a later close is the user's own.
    vi.advanceTimersByTime(3000)
    mondayWindow.close()

    const relaunched = await freshModule()
    relaunched.restoreDetachedPages({ store: null })
    expect(relaunched.listOpenDetachedPages()).toEqual(['todo'])
  })

  it('reopens at the remembered spot, or centred at the same size once that monitor is gone', async () => {
    vi.useFakeTimers()
    electron.displays = [
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
      { workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }
    ]
    const windows = await freshModule()
    windows.openDetachedPage('monday', { store: null })
    lastWindow().emit('move')
    vi.advanceTimersByTime(500)
    windows.closeDetachedPagesWithMainWindow()

    const sameMonitors = await freshModule()
    sameMonitors.restoreDetachedPages({ store: null })
    expect(lastWindow().options).toMatchObject({ x: 2000, y: 100, width: 900, height: 700 })
    sameMonitors.closeDetachedPagesWithMainWindow()

    electron.displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
    const externalUnplugged = await freshModule()
    externalUnplugged.restoreDetachedPages({ store: null })
    expect(lastWindow().options).toMatchObject({ width: 900, height: 700 })
    expect(lastWindow().options.x).toBeUndefined()
  })
})
