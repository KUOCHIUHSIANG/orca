import { getIntlLocale, translate } from '@/i18n/i18n'

/** Due dates are plain `YYYY-MM-DD` calendar days in local time, never instants. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function localToday(): string {
  return toIsoDate(new Date())
}

export function addDays(iso: string, days: number): string {
  const date = fromIsoDate(iso)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/** Monday of next week, as To Do's "Next week" picks it. */
export function nextMonday(today: string): string {
  const weekday = fromIsoDate(today).getDay()
  return addDays(today, (8 - weekday) % 7 || 7)
}

export type TodoMonth = { year: number; month: number }

export function monthOf(iso: string): TodoMonth {
  const date = fromIsoDate(iso)
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function shiftMonth(month: TodoMonth, delta: number): TodoMonth {
  const date = new Date(month.year, month.month + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() }
}

/** Six Sunday-first weeks covering the month, so the picker keeps one height while paging. */
export function monthGrid(month: TodoMonth): { iso: string; inMonth: boolean }[] {
  const first = new Date(month.year, month.month, 1)
  const start = toIsoDate(new Date(month.year, month.month, 1 - first.getDay()))
  return Array.from({ length: 42 }, (_, index) => {
    const iso = addDays(start, index)
    return { iso, inMonth: monthOf(iso).month === month.month }
  })
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
  }).format(fromIsoDate(dueDate))
}
