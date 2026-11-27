import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MondayCalendarSnapshot } from '../../shared/monday-calendar-types'
import {
  clearMondayCalendarCache,
  readMondayCalendarCache,
  saveMondayCalendarCache
} from './monday-calendar-cache'

const DAY = 24 * 60 * 60_000
const NOW = Date.parse('2026-11-27T08:00:00.000Z')

function snapshot(fetchedAt: number, name: string): MondayCalendarSnapshot {
  return {
    items: [
      {
        id: '1',
        name,
        url: 'https://example.monday.com/boards/1/pulses/1',
        boardId: '1',
        boardName: 'Project Cases',
        groupId: null,
        groupTitle: null,
        parentItemName: null,
        ownerIds: ['50798552'],
        startDate: '2026-11-25',
        endDate: '2026-11-27',
        statusLabel: 'Feedback for Dev',
        statusColor: '#a9bee8',
        isDone: false
      }
    ],
    people: [{ id: '50798552', name: 'Jater' }],
    boards: [{ id: '1', name: 'Project Cases', groups: [] }],
    fetchedAt
  }
}

let home: string
const orcaDir = (): string => join(home, '.orca')

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'monday-calendar-cache-'))
  vi.stubEnv('HOME', home)
  vi.stubEnv('USERPROFILE', home)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(home, { recursive: true, force: true })
})

describe('monday calendar cache', () => {
  it('keeps one file however often it is saved, holding the latest calendar', async () => {
    await saveMondayCalendarCache('1,2', snapshot(NOW - 2 * DAY, 'old'))
    await saveMondayCalendarCache('1,2', snapshot(NOW - DAY, 'new'))
    await writeFile(join(orcaDir(), 'monday-calendar-snapshot.json.123.abcd.tmp'), 'cut off')
    await saveMondayCalendarCache('1,2', snapshot(NOW - DAY, 'newest'))

    expect(await readdir(orcaDir())).toEqual(['monday-calendar-snapshot.json'])
    expect((await readMondayCalendarCache('1,2', NOW))?.items[0]?.name).toBe('newest')
  })

  it('deletes the file instead of returning it for other boards, a stale copy or garbage', async () => {
    await saveMondayCalendarCache('1,2', snapshot(NOW - DAY, 'a'))
    expect(await readMondayCalendarCache('1', NOW)).toBeNull()
    expect(await readdir(orcaDir())).toEqual([])

    await saveMondayCalendarCache('1,2', snapshot(NOW - 7 * DAY - 1, 'a'))
    expect(await readMondayCalendarCache('1,2', NOW)).toBeNull()
    expect(await readdir(orcaDir())).toEqual([])

    await writeFile(join(orcaDir(), 'monday-calendar-snapshot.json'), '{not json')
    expect(await readMondayCalendarCache('1,2', NOW)).toBeNull()
    expect(await readdir(orcaDir())).toEqual([])
  })

  it('clearing on disconnect leaves nothing behind', async () => {
    await saveMondayCalendarCache('1,2', snapshot(NOW - DAY, 'a'))
    await writeFile(join(orcaDir(), 'monday-calendar-snapshot.json.9.ff.tmp'), 'cut off')
    await clearMondayCalendarCache()
    expect(await readdir(orcaDir())).toEqual([])
  })
})
