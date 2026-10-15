import {
  addDays,
  buildMonthDays,
  isInMonth,
  parseIsoDate,
  toLocalIsoDate,
  type MonthCursor
} from '@/components/calendar/calendar-dates'
import { getIntlLocale, translate } from '@/i18n/i18n'

export function localToday(): string {
  return toLocalIsoDate(new Date())
}

/** Monday of next week, as To Do's "Next week" picks it. */
export function nextMonday(today: string): string {
  const weekday = parseIsoDate(today).getDay()
  return addDays(today, (8 - weekday) % 7 || 7)
}

/** Six Sunday-first weeks covering the month, so the picker keeps one height while paging. */
export function monthGrid(month: MonthCursor): { iso: string; inMonth: boolean }[] {
  const days = buildMonthDays(month).flat()
  let last = days.at(-1) ?? ''
  while (days.length < 42) {
    last = addDays(last, 1)
    days.push(last)
  }
  return days.map((iso) => ({ iso, inMonth: isInMonth(iso, month) }))
}

export function dueLabel(dueDate: string, today: string): string {
  if (dueDate === today) {
    return translate('auto.components.todoPanel.due.today', 'Today')
  }
  if (dueDate === addDays(today, 1)) {
    return translate('auto.components.todoPanel.due.tomorrow', 'Tomorrow')
  }
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  }).format(parseIsoDate(dueDate))
}
