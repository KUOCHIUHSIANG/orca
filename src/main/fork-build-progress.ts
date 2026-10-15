import { BrowserWindow, ipcMain } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { ForkBuildProgress } from '../shared/fork-build-progress-types'
import { isRecord } from './untrusted-json-guards'

// Written by config/scripts/fork-maintenance/build-progress.mjs into the repo's .git directory.
const PROGRESS_FILE = 'orca-build-progress.json'
const POLL_MS = 2_000
const PHASES: readonly ForkBuildProgress['phase'][] = ['sync', 'claude', 'build', 'restart']

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM still means a process with that pid exists.
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

/** The run a progress file describes, or null once it finished, failed, or its writer died. */
export function readBuildProgress(
  file: string,
  isAlive: (pid: number) => boolean = isProcessAlive
): ForkBuildProgress | null {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.state !== 'running') {
    return null
  }
  const phase = PHASES.find((candidate) => candidate === raw.phase)
  const { pid, startedAt, estimatedEndAt } = raw
  if (
    !phase ||
    typeof pid !== 'number' ||
    typeof startedAt !== 'number' ||
    (estimatedEndAt !== null && typeof estimatedEndAt !== 'number')
  ) {
    return null
  }
  // Why: a killed build leaves its last "running" state behind.
  return isAlive(pid) ? { phase, startedAt, estimatedEndAt } : null
}

let current: ForkBuildProgress | null = null
let lastMtimeMs = 0
const listeners = new Set<(progress: ForkBuildProgress | null) => void>()

function poll(file: string): void {
  let mtimeMs = 0
  try {
    mtimeMs = statSync(file).mtimeMs
  } catch {
    mtimeMs = 0
  }
  // Why re-read while running: the writer can die without touching the file again.
  if (mtimeMs === lastMtimeMs && current === null) {
    return
  }
  lastMtimeMs = mtimeMs
  const next = mtimeMs ? readBuildProgress(file) : null
  if (JSON.stringify(next) === JSON.stringify(current)) {
    return
  }
  current = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('forkSync:buildProgress', next)
    }
  }
  listeners.forEach((listener) => listener(next))
}

export function getForkBuildProgress(): ForkBuildProgress | null {
  return current
}

export function onForkBuildProgress(
  listener: (progress: ForkBuildProgress | null) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let watching = false

/** Fork builds show any running sync/build in the status bar, whoever started it. */
export function registerForkBuildProgress(repoRoot: string | null): void {
  ipcMain.removeHandler('forkSync:getBuildProgress')
  ipcMain.handle('forkSync:getBuildProgress', () => current)
  if (!repoRoot || watching) {
    return
  }
  watching = true
  const file = path.join(repoRoot, '.git', PROGRESS_FILE)
  poll(file)
  setInterval(() => poll(file), POLL_MS).unref()
}
