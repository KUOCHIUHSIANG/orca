#!/usr/bin/env node
// Reports a fork sync/build's progress to a file Orca's status bar reads, and learns how long each
// step takes so the next run can say how much time is left.
//
//   node config/scripts/fork-maintenance/build-progress.mjs restarting --pid <pid>
//   node config/scripts/fork-maintenance/build-progress.mjs done
//
// The CLI is for a manual reinstall: it tells the running app a restart is coming.
// src/main/fork-build-progress.ts reads PROGRESS_FILE; keep the two in step.
import { execFileSync } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const PROGRESS_FILE = 'orca-build-progress.json'
export const TIMINGS_FILE = 'orca-build-timings.json'
/** Set by the sync script so the build continues its progress bar instead of restarting it. */
export const STARTED_AT_ENV = 'ORCA_BUILD_PROGRESS_STARTED_AT'
/** First-run guess for a whole build, replaced by the measured total after one success. */
export const DEFAULT_BUILD_MS = 10 * 60 * 1000
/**
 * Why two timing sets: a build right after an upstream sync starts from cold caches and takes
 * several times longer than a rebuild after a small local change.
 */
export const BUILD_TIMING_PREFIX = { afterSync: 'update-build:', standalone: 'build:' }
const RESTART_MS = 30_000

export function gitCommonDir(cwd) {
  const dir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd,
    encoding: 'utf8'
  }).trim()
  return path.resolve(cwd, dir)
}

function readTimings(gitDir) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(gitDir, TIMINGS_FILE), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeJson(file, value) {
  // Why rename: the app polls this file and must never read half of it.
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value)}\n`)
  renameSync(`${file}.tmp`, file)
}

/** `phase` is what the status bar names; `estimatedEndAt` null means the wait can't be guessed. */
export function writeBuildProgress(gitDir, { state, phase, startedAt, estimatedEndAt, pid }) {
  writeJson(path.join(gitDir, PROGRESS_FILE), {
    state,
    phase,
    startedAt,
    estimatedEndAt,
    pid: pid ?? process.pid,
    updatedAt: Date.now()
  })
}

/** How long the build after a sync should take, from the last one that ran after a sync. */
export function estimatedBuildMs(gitDir) {
  const total = readTimings(gitDir)[`${BUILD_TIMING_PREFIX.afterSync}total`]
  return typeof total === 'number' && total > 0 ? total : DEFAULT_BUILD_MS
}

/**
 * Tracks one phase's ordered steps ({ key, defaultMs }). `laterMs` covers what runs after this
 * phase, e.g. the build after a sync, so the estimate always means "until the restart".
 */
export function createProgressReporter({
  gitDir,
  phase,
  steps,
  laterMs = 0,
  startedAt = Date.now(),
  now = Date.now,
  totalKey = null
}) {
  const timings = readTimings(gitDir)
  const estimate = (step) =>
    typeof timings[step.key] === 'number' ? timings[step.key] : step.defaultMs
  const measured = {}
  let index = -1
  let stepStartedAt = now()
  let waitingOnClaude = false
  // Why: a step Claude worked in ran as long as Claude took, which says nothing about the next run.
  let stepHadClaude = false

  const remainingMs = () => {
    const current = steps[index]
    const currentLeft = current ? Math.max(0, estimate(current) - (now() - stepStartedAt)) : 0
    const after = steps.slice(index + 1).reduce((sum, step) => sum + estimate(step), 0)
    return currentLeft + after + laterMs
  }
  const write = () =>
    writeBuildProgress(gitDir, {
      state: 'running',
      phase: waitingOnClaude ? 'claude' : phase,
      startedAt,
      estimatedEndAt: waitingOnClaude ? null : now() + remainingMs()
    })
  const closeStep = () => {
    if (steps[index] && !stepHadClaude) {
      measured[steps[index].key] = now() - stepStartedAt
    }
  }
  const saveTimings = () => {
    closeStep()
    index = -1
    const next = { ...timings, ...measured }
    if (totalKey) {
      next[totalKey] = Object.values(measured).reduce((sum, ms) => sum + ms, 0)
    }
    writeJson(path.join(gitDir, TIMINGS_FILE), next)
  }

  return {
    step(key) {
      closeStep()
      index = steps.findIndex((step) => step.key === key)
      stepStartedAt = now()
      waitingOnClaude = false
      stepHadClaude = false
      write()
    },
    /** Claude's conflict or type fixes have no predictable length. */
    waitOnClaude() {
      waitingOnClaude = true
      stepHadClaude = true
      write()
    },
    /** Keeps this phase's durations without ending the run, for a phase another script continues. */
    saveTimings,
    finish(state) {
      if (state === 'done') {
        saveTimings()
      }
      writeBuildProgress(gitDir, { state, phase, startedAt, estimatedEndAt: null })
    }
  }
}

if (import.meta.filename === process.argv[1]) {
  const [command, flag, value] = process.argv.slice(2)
  const gitDir = gitCommonDir(path.resolve(import.meta.dirname, '..', '..', '..'))
  if (command === 'restarting' && flag === '--pid' && /^\d+$/.test(value ?? '')) {
    const now = Date.now()
    writeBuildProgress(gitDir, {
      state: 'running',
      phase: 'restart',
      startedAt: now,
      estimatedEndAt: now + RESTART_MS,
      pid: Number(value)
    })
  } else if (command === 'done') {
    writeBuildProgress(gitDir, {
      state: 'done',
      phase: 'restart',
      startedAt: Date.now(),
      estimatedEndAt: null
    })
  } else {
    console.error('Usage: build-progress.mjs restarting --pid <pid> | done')
    process.exit(1)
  }
}
