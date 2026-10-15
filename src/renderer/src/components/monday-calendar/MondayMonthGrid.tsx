import { useMemo, useState } from 'react'
import type { MondayCalendarItem } from '../../../../shared/monday-calendar-types'
import type { TaiwanCalendarDay } from '../../../../shared/taiwan-holiday-types'
import { CalendarDayCell } from '../calendar/CalendarDayCell'
import { CalendarWeekdayHeader } from '../calendar/CalendarWeekdayHeader'
import { isInMonth, toLocalIsoDate, type MonthCursor } from '../calendar/calendar-dates'
import { ownerNamesForItem } from './monday-calendar-filter'
import { MondayItemBar } from './MondayItemBar'
import { buildMonthLayout, type MondayCalendarWeek } from './monday-month-layout'

const NO_HOLIDAYS: readonly TaiwanCalendarDay[] = []

function MondayWeekRow(props: {
  week: MondayCalendarWeek
  striped: boolean
  cursor: MonthCursor
  today: string
  holidaysByDate: ReadonlyMap<string, readonly TaiwanCalendarDay[]>
  peopleById: ReadonlyMap<string, string>
  selectedPersonIds: readonly string[] | null
  showOwnerNames: boolean
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
}): React.JSX.Element {
  const { week } = props
  return (
    <div className="relative min-h-24 shrink-0 grow border-b border-border">
      <div className="absolute inset-0 grid grid-cols-7" aria-hidden>
        {week.days.map((day, index) => (
          <CalendarDayCell
            key={day}
            day={day}
            column={index}
            outsideMonth={!isInMonth(day, props.cursor)}
            today={day === props.today}
            striped={props.striped}
            holidays={props.holidaysByDate.get(day) ?? NO_HOLIDAYS}
          />
        ))}
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
  holidaysByDate: ReadonlyMap<string, readonly TaiwanCalendarDay[]>
  peopleById: ReadonlyMap<string, string>
  selectedPersonIds: readonly string[] | null
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
}): React.JSX.Element {
  const weeks = useMemo(
    () => buildMonthLayout(props.cursor, props.items),
    [props.cursor, props.items]
  )
  const [today] = useState(() => toLocalIsoDate(new Date()))
  // Why: with one person selected every bar is theirs, so repeating the name is noise.
  const showOwnerNames = props.selectedPersonIds === null || props.selectedPersonIds.length > 1

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 md:px-5">
      <CalendarWeekdayHeader />
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto">
        {weeks.map((week, index) => (
          <MondayWeekRow
            key={week.days[0]}
            week={week}
            striped={index % 2 === 1}
            cursor={props.cursor}
            today={today}
            holidaysByDate={props.holidaysByDate}
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
