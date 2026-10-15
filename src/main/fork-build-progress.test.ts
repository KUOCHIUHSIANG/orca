import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() }
}))

const { readBuildProgress } = await import('./fork-build-progress')

let dir = ''
let file = ''
const alive = (): boolean => true

function write(value: unknown): void {
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'fork-build-progress-'))
  file = path.join(dir, 'orca-build-progress.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const running = { state: 'running', phase: 'build', startedAt: 1, estimatedEndAt: 2, pid: 42 }

describe('readBuildProgress', () => {
  it('reports a running build whose writer is alive', () => {
    write(running)
    expect(readBuildProgress(file, alive)).toEqual({
      phase: 'build',
      startedAt: 1,
      estimatedEndAt: 2
    })
  })

  it('keeps an unknown end while Claude works', () => {
    write({ ...running, phase: 'claude', estimatedEndAt: null })
    expect(readBuildProgress(file, alive)?.estimatedEndAt).toBeNull()
  })

  it('hides finished, failed, abandoned and unreadable runs', () => {
    write({ ...running, state: 'done' })
    expect(readBuildProgress(file, alive)).toBeNull()
    write({ ...running, state: 'failed' })
    expect(readBuildProgress(file, alive)).toBeNull()
    write(running)
    expect(readBuildProgress(file, () => false)).toBeNull()
    write('{"state":"runn')
    expect(readBuildProgress(file, alive)).toBeNull()
    write({ ...running, phase: 'deploy' })
    expect(readBuildProgress(file, alive)).toBeNull()
  })

  it('returns null without a progress file', () => {
    expect(readBuildProgress(path.join(dir, 'missing.json'), alive)).toBeNull()
  })
})
