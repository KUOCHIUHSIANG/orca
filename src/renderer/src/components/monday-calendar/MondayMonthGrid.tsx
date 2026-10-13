import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { getIntlLocale } from '@/i18n/i18n'
import type { MondayCalendarItem } from '../../../../shared/monday-calendar-types'
import { ownerNamesForItem } from './monday-calendar-filter'
import { MondayItemBar } from './MondayItemBar'
import {
  buildMonthLayout,
  isInMonth,
  toLocalIsoDate,
  type MondayCalendarWeek,
  type MonthCursor
} from './monday-month-layout'

// 2026-01-04 is a Sunday; the grid is Sunday-first.
const SUNDAY_UTC_MS = Date.UTC(2026, 0, 4)
const DAY_MS = 86_400_000

function isWeekendColumn(column: number): boolean {
  return column === 0 || column === 6
}

function useWeekdayLabels(): string[] {
  const locale = getIntlLocale()
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(SUNDAY_UTC_MS + index * DAY_MS))
    )
  }, [locale])
}

function MondayWeekRow(props: {
  week: MondayCalendarWeek
  /** Alternate weeks get a faint band so multi-day bars read as belonging to their row. */
  striped: boolean
  cursor: MonthCursor
  today: string
  peopleById: ReadonlyMap<string, string>
  selectedPersonIds: readonly string[] | null
  showOwnerNames: boolean
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
}): React.JSX.Element {
  const { week } = props
  return (
    <div
      className={cn(
        'relative min-h-24 shrink-0 grow border-b border-border',
        props.striped && 'bg-foreground/[0.035]'
      )}
    >
      <div className="absolute inset-0 grid grid-cols-7" aria-hidden>
        {week.days.map((day, index) => {
          const outside = !isInMonth(day, props.cursor)
          const weekend = isWeekendColumn(index)
          return (
            <div
              key={day}
              className={cn(
                'px-1.5 pt-1',
                index > 0 && 'border-l border-border',
                // Why: a translucent wash (not opaque muted) so it still stacks on striped weeks.
                weekend && 'bg-foreground/[0.045]'
              )}
            >
              <span
                className={cn(
                  'inline-flex size-5 items-center justify-center rounded-full text-xs tabular-nums',
                  day === props.today
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : outside || weekend
                      ? 'text-muted-foreground/60'
                      : 'text-muted-foreground'
                )}
              >
                {Number(day.slice(8))}
              </span>
            </div>
          )
        })}
      </div>
      <div className="relative grid grid-cols-7 auto-rows-[22px] gap-y-0.5 pt-7 pb-1.5">
        {week.segments.map((segment) => (
          <MondayItemBar
            key={`${segment.item.id}:${week.days[0]}`}
            segment={segment}
            ownerNames={
              props.showOwnerNames
                ? ownerNamesForItem(segment.item, props.peopleById, props.selectedPersonIds)
                : []
            }
            selected={segment.item.id === props.selectedItemId}
            onSelect={() => props.onSelectItem(segment.item.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function MondayMonthGrid(props: {
  cursor: MonthCursor
  items: readonly MondayCalendarItem[]
  peopleById: ReadonlyMap<string, string>
  selectedPersonIds: readonly string[] | null
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
}): React.JSX.Element {
  const weekdayLabels = useWeekdayLabels()
  const weeks = useMemo(
    () => buildMonthLayout(props.cursor, props.items),
    [props.cursor, props.items]
  )
  const [today] = useState(() => toLocalIsoDate(new Date()))
  // Why: with one person selected every bar is theirs, so repeating the name is noise.
  const showOwnerNames = props.selectedPersonIds === null || props.selectedPersonIds.length > 1

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 md:px-5">
      <div className="grid shrink-0 grid-cols-7 border-b border-border pb-1.5">
        {weekdayLabels.map((label, index) => (
          <div
            key={label}
            className={cn(
              'px-1.5 text-[11px] font-medium',
              isWeekendColumn(index) ? 'text-muted-foreground/60' : 'text-muted-foreground'
            )}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto">
        {weeks.map((week, index) => (
          <MondayWeekRow
            key={week.days[0]}
            week={week}
            striped={index % 2 === 1}
            cursor={props.cursor}
            today={today}
            peopleById={props.peopleById}
            selectedPersonIds={props.selectedPersonIds}
            showOwnerNames={showOwnerNames}
            selectedItemId={props.selectedItemId}
            onSelectItem={props.onSelectItem}
          />
        ))}
      </div>
    </div>
  )
}
