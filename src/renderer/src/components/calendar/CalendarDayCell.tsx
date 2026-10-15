import { cn } from '@/lib/utils'
import type { TaiwanCalendarDay } from '../../../../shared/taiwan-holiday-types'
import { describeCalendarDay } from './calendar-day-off'

/** One background cell of a week row: date number, Taiwan holiday label, and day-off shading. */
export function CalendarDayCell(props: {
  day: string
  column: number
  outsideMonth: boolean
  today: boolean
  /** Alternate weeks get a faint band so multi-day bars read as belonging to their row. */
  striped: boolean
  holidays: readonly TaiwanCalendarDay[]
}): React.JSX.Element {
  const { holidayOff, makeupWorkday, dayOff, label } = describeCalendarDay(
    props.column,
    props.holidays
  )
  return (
    <div
      data-day-off={holidayOff ? 'holiday' : dayOff ? 'weekend' : undefined}
      className={cn(
        'flex min-w-0 items-start gap-1 px-1.5 pt-1',
        props.column > 0 && 'border-l border-border',
        // Why: holidays take their label's green and plain weekends gray; either replaces the
        // week band instead of stacking on it, so a day off looks the same in every week.
        holidayOff
          ? 'bg-status-success-background'
          : dayOff
            ? 'bg-foreground/[0.06]'
            : props.striped && 'bg-foreground/[0.035]'
      )}
    >
      <span
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
          // Why: days off read red, as on a printed Taiwan calendar; overdue red is on task titles.
          props.today
            ? 'bg-primary font-semibold text-primary-foreground'
            : dayOff
              ? props.outsideMonth
                ? 'text-destructive/60'
                : 'text-destructive'
              : props.outsideMonth
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
