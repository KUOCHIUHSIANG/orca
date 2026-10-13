import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TaiwanHolidays from './taiwan-holidays'

let tempHome = ''
const fetchMock = vi.fn<(url: string) => Promise<Response>>()

const ROWS = [
  {
    date: '20261010',
    isholiday: '是',
    holidaycategory: '放假之紀念日及節日',
    name: '國慶日',
    description: ''
  },
  { date: '20261009', isholiday: '是', holidaycategory: '補假', name: null, description: '' },
  {
    date: '20260220',
    isholiday: '是',
    holidaycategory: '補假',
    name: '春節',
    description: '補假一日'
  },
  {
    date: '20190208',
    isholiday: '是',
    holidaycategory: '調整放假日',
    name: null,
    description: null
  },
  {
    date: '20190223',
    isholiday: '否',
    holidaycategory: '補行上班日',
    name: null,
    description: null
  },
  {
    date: '20260501',
    isholiday: '是',
    holidaycategory: '特定節日',
    name: '勞動節',
    description: '全國各機關學校及勞工放假一日。'
  },
  {
    date: '20260903',
    isholiday: '是',
    holidaycategory: '特定節日',
    name: '軍人節',
    description: '軍人依國防部規定辦理。'
  },
  {
    date: '20261011',
    isholiday: '是',
    holidaycategory: '星期六、星期日',
    name: null,
    description: null
  }
]

async function loadModule(): Promise<typeof TaiwanHolidays> {
  vi.resetModules()
  vi.doMock('node:os', async () => {
    const actual = await vi.importActual<typeof Os>('node:os')
    return { ...actual, homedir: () => tempHome }
  })
  const { setMainHttpClient } = await import('../network/http-client')
  setMainHttpClient({ fetch: (url) => fetchMock(url), proxySession: () => null })
  return import('./taiwan-holidays')
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'orca-taiwan-holidays-'))
  fetchMock.mockReset()
})

describe('mapTaiwanHolidayRows', () => {
  it('classifies days off, substitutes, observances, and make-up workdays', async () => {
    const { mapTaiwanHolidayRows } = await loadModule()
    expect(mapTaiwanHolidayRows(ROWS)).toEqual([
      { date: '2026-10-10', name: '國慶日', kind: 'holiday' },
      { date: '2026-10-09', name: null, kind: 'substitute' },
      { date: '2026-02-20', name: '春節', kind: 'substitute' },
      { date: '2019-02-08', name: null, kind: 'substitute' },
      { date: '2019-02-23', name: null, kind: 'makeup-workday' },
      { date: '2026-05-01', name: '勞動節', kind: 'holiday' },
      { date: '2026-09-03', name: '軍人節', kind: 'observance' }
    ])
  })
})

describe('getTaiwanHolidays', () => {
  it('downloads once, then serves the disk copy until it is a week old', async () => {
    fetchMock.mockResolvedValue(Response.json(ROWS))
    const { getTaiwanHolidays } = await loadModule()

    const first = await getTaiwanHolidays(() => 1_000)
    expect(first.ok && first.days).toHaveLength(7)
    expect(existsSync(join(tempHome, '.orca', 'taiwan-holidays.json'))).toBe(true)

    await getTaiwanHolidays(() => 2_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await getTaiwanHolidays(() => 1_000 + 8 * 24 * 60 * 60 * 1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to the stale copy when the refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(ROWS))
    const { getTaiwanHolidays } = await loadModule()
    await getTaiwanHolidays(() => 1_000)

    // A fresh process reads the copy left on disk.
    fetchMock.mockRejectedValue(new Error('offline'))
    const reloaded = await loadModule()
    const result = await reloaded.getTaiwanHolidays(() => 1_000 + 30 * 24 * 60 * 60 * 1000)
    expect(result).toMatchObject({ ok: true, fetchedAt: 1_000 })
  })

  it('reports a failure when nothing has ever been downloaded', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { getTaiwanHolidays } = await loadModule()
    await expect(getTaiwanHolidays()).resolves.toEqual({ ok: false, message: 'offline' })
  })
})
