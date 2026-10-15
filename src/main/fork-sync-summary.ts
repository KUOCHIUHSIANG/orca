import { ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ForkSyncSummary } from '../shared/fork-sync-summary-types'
import { getForkSource } from './fork-update'

// Written by config/scripts/fork-maintenance/sync-upstream.mjs into the repo's .git directory.
const SUMMARY_FILE = 'orca-sync-summary.md'
const SEEN_FILE = 'orca-sync-summary.seen'
const SUMMARY_HEADER = /^# 同步上游 (v\d+\.\d+\.\d+)\n/

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/** The last sync's summary while it is unseen and describes the version this build is based on. */
export function readUnseenSyncSummary(gitDir: string, baseTag: string): ForkSyncSummary | null {
  const text = readText(path.join(gitDir, SUMMARY_FILE))
  const match = text === null ? null : SUMMARY_HEADER.exec(text)
  // Why the tag check: a sync whose build failed describes an update this app is not running yet.
  if (text === null || !match || match[1] !== baseTag) {
    return null
  }
  const id = createHash('sha256').update(text).digest('hex')
  if (readText(path.join(gitDir, SEEN_FILE))?.trim() === id) {
    return null
  }
  return { id, version: baseTag, summary: text.slice(match[0].length).trim() }
}

export function markSyncSummarySeen(gitDir: string, id: string): void {
  writeFileSync(path.join(gitDir, SEEN_FILE), `${id}\n`)
}

function forkGitDir(): { gitDir: string; baseTag: string } | null {
  const fork = getForkSource()
  return fork ? { gitDir: path.join(fork.repoRoot, '.git'), baseTag: fork.baseTag } : null
}

export function registerForkSyncSummaryHandlers(): void {
  ipcMain.removeHandler('forkSync:getSummary')
  ipcMain.removeHandler('forkSync:dismissSummary')
  ipcMain.handle('forkSync:getSummary', () => {
    const fork = forkGitDir()
    return fork ? readUnseenSyncSummary(fork.gitDir, fork.baseTag) : null
  })
  ipcMain.handle('forkSync:dismissSummary', (_event, id: unknown) => {
    const fork = forkGitDir()
    if (fork && typeof id === 'string' && /^[0-9a-f]{64}$/.test(id)) {
      markSyncSummarySeen(fork.gitDir, id)
    }
  })
}
