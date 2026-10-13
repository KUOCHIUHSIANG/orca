import { cn } from '@/lib/utils'
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

/** One background cell of a week row: date number, Taiwan holiday label, and day-off shading. */
export function MondayDayCell(props: {
  day: string
  column: number
  outsideMonth: boolean
  today: boolean
  holidays: readonly TaiwanCalendarDay[]
}): React.JSX.Element {
  const weekend = props.column === 0 || props.column === 6
  const makeupWorkday = props.holidays.some((day) => day.kind === 'makeup-workday')
  const holidayOff = props.holidays.some((day) => isTaiwanDayOff(day.kind))
  // Why: a Saturday 補班 is a working day, so it must not read as a weekend.
  const dayOff = holidayOff || (weekend && !makeupWorkday)
  const label = props.holidays.map(holidayLabel).filter(Boolean).join('、')
  return (
    <div
      className={cn(
        'flex min-w-0 items-start gap-1 px-1.5 pt-1',
        props.column > 0 && 'border-l border-border',
        // Why: a translucent wash (not opaque muted) so it still stacks on striped weeks.
        dayOff && 'bg-foreground/[0.045]'
      )}
    >
      <span
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
          props.today
            ? 'bg-primary font-semibold text-primary-foreground'
            : props.outsideMonth || dayOff
              ? 'text-muted-foreground/60'
              : 'text-muted-foreground'
        )}
      >
        {Number(props.day.slice(8))}
      </span>
      {label ? (
        <span
          className={cn(
            'mt-0.5 min-w-0 truncate rounded-sm px-1 text-[11px] leading-4',
            makeupWorkday
              ? 'bg-status-warning-background text-status-warning'
              : holidayOff
                ? 'bg-status-success-background text-status-success'
                : 'text-muted-foreground',
            props.outsideMonth && 'opacity-60'
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  )
}
