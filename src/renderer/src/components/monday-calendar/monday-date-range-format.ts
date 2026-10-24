import { getIntlLocale } from '@/i18n/i18n'
import type { MondayCalendarItem } from '../../../../shared/monday-calendar-types'
import { parseIsoDate } from '../calendar/calendar-dates'

/** An update's exact creation time ("Oct 20, 2026, 2:30 PM") in the UI language. */
export function formatMondayEntryTime(createdAt: string): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(createdAt))
}

/** "10/13 (Tue) – 10/16 (Fri)" in the UI language, or null for an undated task. */
export function formatMondayDateRange(item: MondayCalendarItem): string | null {
  if (item.startDate === null || item.endDate === null) {
    return null
  }
  const formatter = new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  })
  const start = formatter.format(parseIsoDate(item.startDate))
  return item.startDate === item.endDate
    ? start
    : `${start} – ${formatter.format(parseIsoDate(item.endDate))}`
}
