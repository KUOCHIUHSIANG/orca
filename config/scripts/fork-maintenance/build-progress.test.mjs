import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BUILD_TIMINGS_TOTAL_KEY,
  createProgressReporter,
  DEFAULT_BUILD_MS,
  estimatedBuildMs,
  PROGRESS_FILE,
  TIMINGS_FILE
} from './build-progress.mjs'

let gitDir = ''
let clock = 0
const now = () => clock

function progress() {
  return JSON.parse(readFileSync(path.join(gitDir, PROGRESS_FILE), 'utf8'))
}
function timings() {
  return JSON.parse(readFileSync(path.join(gitDir, TIMINGS_FILE), 'utf8'))
}

beforeEach(() => {
  gitDir = mkdtempSync(path.join(os.tmpdir(), 'build-progress-'))
  clock = 1_000_000
})

afterEach(() => {
  rmSync(gitDir, { recursive: true, force: true })
})

const steps = [
  { key: 'a', defaultMs: 10_000 },
  { key: 'b', defaultMs: 30_000 }
]

describe('createProgressReporter', () => {
  it('estimates the end from defaults plus what runs afterwards', () => {
    const reporter = createProgressReporter({ gitDir, phase: 'build', steps, laterMs: 5_000, now })
    reporter.step('a')
    expect(progress()).toMatchObject({
      state: 'running',
      phase: 'build',
      estimatedEndAt: clock + 45_000
    })
    clock += 4_000
    reporter.step('b')
    expect(progress().estimatedEndAt).toBe(clock + 35_000)
  })

  it('learns measured durations on success so the next run uses them', () => {
    const first = createProgressReporter({
      gitDir,
      phase: 'build',
      steps,
      now,
      totalKey: BUILD_TIMINGS_TOTAL_KEY
    })
    first.step('a')
    clock += 2_000
    first.step('b')
    clock += 6_000
    first.finish('done')
    expect(timings()).toEqual({ a: 2_000, b: 6_000, [BUILD_TIMINGS_TOTAL_KEY]: 8_000 })
    expect(progress().state).toBe('done')
    expect(estimatedBuildMs(gitDir)).toBe(8_000)

    const second = createProgressReporter({ gitDir, phase: 'build', steps, now })
    second.step('a')
    expect(progress().estimatedEndAt).toBe(clock + 8_000)
  })

  it('keeps old timings when a run fails', () => {
    writeFileSync(path.join(gitDir, TIMINGS_FILE), JSON.stringify({ a: 1_000 }))
    const reporter = createProgressReporter({ gitDir, phase: 'build', steps, now })
    reporter.step('a')
    clock += 9_000
    reporter.finish('failed')
    expect(timings()).toEqual({ a: 1_000 })
    expect(progress().state).toBe('failed')
  })

  it('has no estimate while Claude works, then resumes at the next step', () => {
    const reporter = createProgressReporter({ gitDir, phase: 'sync', steps, now })
    reporter.step('a')
    reporter.waitOnClaude()
    expect(progress()).toMatchObject({ phase: 'claude', estimatedEndAt: null })
    reporter.step('b')
    expect(progress()).toMatchObject({ phase: 'sync', estimatedEndAt: clock + 30_000 })
  })

  it('does not learn from a step Claude worked in', () => {
    const reporter = createProgressReporter({ gitDir, phase: 'sync', steps, now })
    reporter.step('a')
    reporter.waitOnClaude()
    clock += 600_000
    reporter.step('b')
    clock += 3_000
    reporter.saveTimings()
    expect(timings()).toEqual({ b: 3_000 })
    // Why: the build script takes over the bar, so saving must not mark the run finished.
    expect(progress().state).toBe('running')
  })

  it('falls back to a default build length before any build finished', () => {
    expect(estimatedBuildMs(gitDir)).toBe(DEFAULT_BUILD_MS)
  })
})
