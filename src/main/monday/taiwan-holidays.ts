import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { writeCredentialFileAtomic } from '../integration-credential-file'
import { getMainHttpClient } from '../network/http-client'
import type {
  TaiwanCalendarDay,
  TaiwanHolidayKind,
  TaiwanHolidaysResult
} from '../../shared/taiwan-holiday-types'
import { asArray, asString, isRecord } from '../untrusted-json-guards'

// New Taipei's mirror of the DGPA government office calendar; the DGPA dataset itself is CSV-only
// and moves to a new resource URL every year.
const SOURCE_URL = 'https://data.ntpc.gov.tw/api/datasets/308dcd75-6434-45bc-a95f-584da4fed251/json'
const PAGE_SIZE = 5000
const MAX_PAGES = 5
const REQUEST_TIMEOUT_MS = 20_000
// Why: the calendar changes once a year (each summer), so a weekly refresh is plenty.
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000

type HolidayCache = { version: 1; fetchedAt: number; days: TaiwanCalendarDay[] }

let memoryCache: HolidayCache | null = null

function getCachePath(): string {
  return join(homedir(), '.orca', 'taiwan-holidays.json')
}

function toIsoDate(compact: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(compact)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

function classify(category: string, isHoliday: boolean, description: string): TaiwanHolidayKind {
  if (category === '補行上班日') {
    return 'makeup-workday'
  }
  if (category === '補假' || category === '調整放假日') {
    return 'substitute'
  }
  if (category === '特定節日') {
    // Why: 勞動節 is off for workers while 軍人節 only concerns the military.
    return isHoliday && /勞工|全國/.test(description) ? 'holiday' : 'observance'
  }
  return isHoliday ? 'holiday' : 'observance'
}

/** Keeps the named days, substitutes, and make-up workdays; plain weekends are dropped. */
export function mapTaiwanHolidayRows(rows: unknown): TaiwanCalendarDay[] {
  return asArray(rows).flatMap((row) => {
    if (!isRecord(row)) {
      return []
    }
    const date = toIsoDate(asString(row.date) ?? '')
    const category = asString(row.holidaycategory) ?? ''
    if (!date || category === '星期六、星期日') {
      return []
    }
    const kind = classify(category, row.isholiday === '是', asString(row.description) ?? '')
    return [{ date, name: kind === 'makeup-workday' ? null : asString(row.name), kind }]
  })
}

async function fetchRows(): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await getMainHttpClient().fetch(
      `${SOURCE_URL}?page=${page}&size=${PAGE_SIZE}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    )
    if (!response.ok) {
      throw new Error(`Holiday calendar request failed (HTTP ${response.status}).`)
    }
    const batch = asArray(await response.json())
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) {
      break
    }
  }
  return rows
}

function readCache(): HolidayCache | null {
  if (memoryCache) {
    return memoryCache
  }
  const path = getCachePath()
  if (!existsSync(path)) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    if (isRecord(parsed) && typeof parsed.fetchedAt === 'number') {
      memoryCache = { version: 1, fetchedAt: parsed.fetchedAt, days: mapCachedDays(parsed.days) }
      return memoryCache
    }
  } catch {
    // A corrupt cache is simply refetched.
  }
  return null
}

const HOLIDAY_KINDS: readonly TaiwanHolidayKind[] = [
  'holiday',
  'substitute',
  'observance',
  'makeup-workday'
]

function isHolidayKind(value: unknown): value is TaiwanHolidayKind {
  return HOLIDAY_KINDS.some((kind) => kind === value)
}

function mapCachedDays(value: unknown): TaiwanCalendarDay[] {
  return asArray(value).flatMap((day) => {
    if (!isRecord(day) || typeof day.date !== 'string' || !isHolidayKind(day.kind)) {
      return []
    }
    return [{ date: day.date, name: asString(day.name), kind: day.kind }]
  })
}

function writeCache(cache: HolidayCache): void {
  memoryCache = cache
  try {
    mkdirSync(join(homedir(), '.orca'), { recursive: true })
    writeCredentialFileAtomic(getCachePath(), Buffer.from(JSON.stringify(cache), 'utf-8'))
  } catch (error) {
    console.warn('[taiwan-holidays] could not write cache:', error)
  }
}

/** Serves the on-disk copy while fresh; otherwise refetches and falls back to the stale copy offline. */
export async function getTaiwanHolidays(
  now: () => number = Date.now
): Promise<TaiwanHolidaysResult> {
  const cached = readCache()
  if (cached && now() - cached.fetchedAt < REFRESH_AFTER_MS) {
    return { ok: true, days: cached.days, fetchedAt: cached.fetchedAt }
  }
  try {
    const days = mapTaiwanHolidayRows(await fetchRows())
    const fresh: HolidayCache = { version: 1, fetchedAt: now(), days }
    writeCache(fresh)
    return { ok: true, days, fetchedAt: fresh.fetchedAt }
  } catch (error) {
    if (cached) {
      return { ok: true, days: cached.days, fetchedAt: cached.fetchedAt }
    }
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/** @internal - tests need a clean in-memory cache between cases. */
export function _resetTaiwanHolidayCache(): void {
  memoryCache = null
}
