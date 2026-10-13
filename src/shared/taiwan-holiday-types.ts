/**
 * holiday: a national day off. substitute: a day off in lieu (補假/調整放假).
 * observance: named but not a general day off (e.g. 軍人節). makeup-workday: 補行上班.
 */
export type TaiwanHolidayKind = 'holiday' | 'substitute' | 'observance' | 'makeup-workday'

export type TaiwanCalendarDay = {
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  /** The government calendar's name; null for unnamed substitutes and make-up workdays. */
  name: string | null
  kind: TaiwanHolidayKind
}

export type TaiwanHolidaysResult =
  | { ok: true; days: TaiwanCalendarDay[]; fetchedAt: number }
  | { ok: false; message: string }

export function isTaiwanDayOff(kind: TaiwanHolidayKind): boolean {
  return kind === 'holiday' || kind === 'substitute'
}
