import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { isDetachedPage, isRecord, type DetachedPage } from '../../shared/detached-pages'
import type { WindowRect } from './window-bounds-validation'

/** Which pages live in their own window and where, so a restart reopens them in place. */
type DetachedPagesState = {
  open: DetachedPage[]
  bounds: Partial<Record<DetachedPage, WindowRect>>
  /** The monday.com task the task window last showed, so a restart reopens it. */
  mondayTaskUrl: string | null
}

let cached: DetachedPagesState | null = null

function statePath(): string {
  // Why: userData, not ~/.orca, so a dev build never moves the installed app's windows.
  return join(app.getPath('userData'), 'detached-pages.json')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readRect(value: unknown): WindowRect | null {
  if (!isRecord(value)) {
    return null
  }
  const { x, y, width, height } = value
  return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(width) && isFiniteNumber(height)
    ? { x, y, width, height }
    : null
}

function readState(): DetachedPagesState {
  if (cached) {
    return cached
  }
  const state: DetachedPagesState = { open: [], bounds: {}, mondayTaskUrl: null }
  try {
    const parsed: unknown = JSON.parse(readFileSync(statePath(), 'utf-8'))
    if (isRecord(parsed)) {
      const { open, bounds, mondayTaskUrl } = parsed
      state.mondayTaskUrl = typeof mondayTaskUrl === 'string' ? mondayTaskUrl : null
      state.open = Array.isArray(open) ? [...new Set(open.filter(isDetachedPage))] : []
      if (isRecord(bounds)) {
        for (const [page, rect] of Object.entries(bounds)) {
          const parsedRect = readRect(rect)
          if (isDetachedPage(page) && parsedRect) {
            state.bounds[page] = parsedRect
          }
        }
      }
    }
  } catch {
    // Missing or corrupt state reads as no windows to restore.
  }
  cached = state
  return state
}

function writeState(state: DetachedPagesState): void {
  cached = state
  try {
    writeFileAtomically(statePath(), `${JSON.stringify({ version: 1, ...state }, null, 2)}\n`)
  } catch (error) {
    console.warn('[detached-pages] Failed to save window state:', error)
  }
}

export function readDetachedPagesToRestore(): DetachedPage[] {
  return [...readState().open]
}

export function setDetachedPageRestorable(page: DetachedPage, open: boolean): void {
  const state = readState()
  if (state.open.includes(page) === open) {
    return
  }
  writeState({
    ...state,
    open: open ? [...state.open, page] : state.open.filter((entry) => entry !== page)
  })
}

export function readDetachedPageBounds(page: DetachedPage): WindowRect | null {
  return readState().bounds[page] ?? null
}

export function saveDetachedPageBounds(page: DetachedPage, bounds: WindowRect): void {
  const state = readState()
  writeState({ ...state, bounds: { ...state.bounds, [page]: bounds } })
}

export function readMondayTaskUrl(): string | null {
  return readState().mondayTaskUrl
}

export function saveMondayTaskUrl(url: string): void {
  const state = readState()
  if (state.mondayTaskUrl !== url) {
    writeState({ ...state, mondayTaskUrl: url })
  }
}
