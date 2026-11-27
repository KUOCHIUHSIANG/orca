import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { writeCredentialFileAtomic } from '../credentials/integration-credential-file'
import { isRecord } from '../untrusted-json-guards'

/** Notification id → its creation time, so entries can expire with the lookback window. */
type ReadMap = Map<string, number>

let cachedRead: ReadMap | null = null
let loading: Promise<void> | null = null

function getReadStatePath(): string {
  // Why: ids only; comment text never touches disk because comments often hold credentials.
  return join(homedir(), '.orca', 'monday-notifications.json')
}

async function readReadState(): Promise<ReadMap> {
  const read: ReadMap = new Map()
  try {
    const parsed: unknown = JSON.parse(await readFile(getReadStatePath(), 'utf-8'))
    const entries = isRecord(parsed) && isRecord(parsed.read) ? parsed.read : {}
    for (const [id, time] of Object.entries(entries)) {
      if (typeof time === 'number' && Number.isFinite(time)) {
        read.set(id, time)
      }
    }
  } catch {
    // Missing or corrupt state reads as nothing read yet.
  }
  return read
}

export function loadMondayNotificationReadState(): Promise<void> {
  loading ??= readReadState().then((read) => {
    cachedRead = read
  })
  return loading
}

/** False until loadMondayNotificationReadState settles. */
export function isMondayNotificationRead(id: string): boolean {
  return cachedRead?.has(id) ?? false
}

export async function saveMondayNotificationsRead(
  entries: readonly { id: string; createdAt: string }[],
  keepAfter: number
): Promise<void> {
  const read = new Map(cachedRead ?? [])
  for (const entry of entries) {
    read.set(entry.id, Date.parse(entry.createdAt) || Date.now())
  }
  for (const [id, time] of read) {
    if (time < keepAfter) {
      read.delete(id)
    }
  }
  cachedRead = read
  const path = getReadStatePath()
  await mkdir(dirname(path), { recursive: true })
  await writeCredentialFileAtomic(
    path,
    Buffer.from(JSON.stringify({ version: 1, read: Object.fromEntries(read) }, null, 2), 'utf-8')
  )
}
