import { useEffect, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import type { TaiwanCalendarDay } from '../../../../shared/taiwan-holiday-types'

type HolidaysByDate = ReadonlyMap<string, readonly TaiwanCalendarDay[]>

const EMPTY: HolidaysByDate = new Map()
let cached: HolidaysByDate | null = null

function groupByDate(days: readonly TaiwanCalendarDay[]): HolidaysByDate {
  const byDate = new Map<string, TaiwanCalendarDay[]>()
  for (const day of days) {
    byDate.set(day.date, [...(byDate.get(day.date) ?? []), day])
  }
  return byDate
}

/** Taiwan holidays keyed by YYYY-MM-DD; main serves its weekly-refreshed disk copy, so this is cheap. */
export function useTaiwanHolidays(enabled: boolean): HolidaysByDate {
  const mountedRef = useMountedRef()
  const [holidays, setHolidays] = useState<HolidaysByDate | null>(cached)

  useEffect(() => {
    if (!enabled) {
      return
    }
    void window.api.monday
      .fetchTaiwanHolidays()
      .then((result) => {
        if (!result.ok) {
          console.warn('Could not load Taiwan holidays:', result.message)
          return
        }
        cached = groupByDate(result.days)
        if (mountedRef.current) {
          setHolidays(cached)
        }
      })
      .catch((error: unknown) => console.warn('Could not load Taiwan holidays:', error))
  }, [enabled, mountedRef])

  return enabled ? (holidays ?? EMPTY) : EMPTY
}
