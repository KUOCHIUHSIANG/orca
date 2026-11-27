import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { writeCredentialFileAtomic } from '../credentials/integration-credential-file'
import type { MondayCalendarSnapshot } from '../../shared/monday-calendar-types'
import { isRecord } from '../untrusted-json-guards'

/** Older than this the calendar is too stale to show, so the file is dropped instead. */
export const MONDAY_CALENDAR_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000
const FILE_NAME = 'monday-calendar-snapshot.json'

function cacheDirectory(): string {
  return join(homedir(), '.orca')
}

function cachePath(): string {
  return join(cacheDirectory(), FILE_NAME)
}

/** A write cut off mid-way leaves `<file>.<pid>.<hex>.tmp`; nothing else may pile up beside it. */
async function removeStrayTempFiles(): Promise<void> {
  const names = await readdir(cacheDirectory()).catch(() => [])
  await Promise.all(
    names
      .filter((name) => name.startsWith(`${FILE_NAME}.`) && name.endsWith('.tmp'))
      .map((name) => rm(join(cacheDirectory(), name), { force: true }))
  )
}

export async function clearMondayCalendarCache(): Promise<void> {
  await rm(cachePath(), { force: true })
  await removeStrayTempFiles()
}

/**
 * One file, replaced whole on every successful load, so it never grows past one calendar.
 * Task names, dates, owners and status only; comments never reach it.
 */
export async function saveMondayCalendarCache(
  boardKey: string,
  snapshot: MondayCalendarSnapshot
): Promise<void> {
  await mkdir(cacheDirectory(), { recursive: true })
  await writeCredentialFileAtomic(
    cachePath(),
    Buffer.from(JSON.stringify({ version: 1, boardKey, snapshot }), 'utf-8')
  )
  await removeStrayTempFiles()
}

function readSnapshot(value: unknown): MondayCalendarSnapshot | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.people) ||
    !Array.isArray(value.boards) ||
    typeof value.fetchedAt !== 'number'
  ) {
    return null
  }
  return value as MondayCalendarSnapshot
}

/** The last calendar for these boards, if fresh enough; anything else is deleted on the way. */
export async function readMondayCalendarCache(
  boardKey: string,
  now = Date.now()
): Promise<MondayCalendarSnapshot | null> {
  let raw: string
  try {
    raw = await readFile(cachePath(), 'utf-8')
  } catch {
    return null
  }
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Corrupt files are dropped below like stale ones.
  }
  const snapshot = isRecord(parsed) ? readSnapshot(parsed.snapshot) : null
  const usable =
    snapshot !== null &&
    isRecord(parsed) &&
    parsed.boardKey === boardKey &&
    snapshot.fetchedAt <= now &&
    now - snapshot.fetchedAt <= MONDAY_CALENDAR_CACHE_MAX_AGE_MS
  if (!usable) {
    await clearMondayCalendarCache()
    return null
  }
  return snapshot
}
