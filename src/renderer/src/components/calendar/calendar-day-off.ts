import { translate } from '@/i18n/i18n'
import { isTaiwanDayOff, type TaiwanCalendarDay } from '../../../../shared/taiwan-holiday-types'

function holidayLabel(day: TaiwanCalendarDay): string {
  switch (day.kind) {
    case 'makeup-workday':
      return translate('auto.components.mondayCalendar.holidays.makeupWorkday', 'Make-up workday')
    case 'substitute':
      return day.name
        ? translate(
            'auto.components.mondayCalendar.holidays.substituteFor',
            '{{value0}} (day off)',
            {
              value0: day.name
            }
          )
        : translate('auto.components.mondayCalendar.holidays.substitute', 'Day off in lieu')
    case 'holiday':
    case 'observance':
      return day.name ?? ''
  }
}

/** How a day in a Sunday-first column reads in Taiwan's calendar, shared by grids and pickers. */
export function describeCalendarDay(
  column: number,
  holidays: readonly TaiwanCalendarDay[]
): { holidayOff: boolean; makeupWorkday: boolean; dayOff: boolean; label: string } {
  const weekend = column === 0 || column === 6
  const makeupWorkday = holidays.some((day) => day.kind === 'makeup-workday')
  const holidayOff = holidays.some((day) => isTaiwanDayOff(day.kind))
  return {
    holidayOff,
    makeupWorkday,
    // Why: a Saturday 補班 is a working day, so it must not read as a weekend.
    dayOff: holidayOff || (weekend && !makeupWorkday),
    label: holidays.map(holidayLabel).filter(Boolean).join('、')
  }
}
