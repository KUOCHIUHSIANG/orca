import { CalendarDayCell } from '@/components/calendar/CalendarDayCell'
import { isInMonth, type MonthCursor } from '@/components/calendar/calendar-dates'
import { cn } from '@/lib/utils'
import type { MicrosoftTodoTask } from '../../../../shared/microsoft-todo-types'
import type { TaiwanCalendarDay } from '../../../../shared/taiwan-holiday-types'

const NO_HOLIDAYS: readonly TaiwanCalendarDay[] = []
const NO_TASKS: readonly MicrosoftTodoTask[] = []

/** Seven day columns over shaded day cells; the week view stretches one, the month view stacks them. */
export function TodoCalendarWeekRow(props: {
  days: readonly string[]
  /** Set in month view, where days outside the month are dimmed. */
  month: MonthCursor | null
  today: string
  striped: boolean
  holidaysByDate: ReadonlyMap<string, readonly TaiwanCalendarDay[]>
  tasksByDay: ReadonlyMap<string, readonly MicrosoftTodoTask[]>
  renderTask: (task: MicrosoftTodoTask) => React.ReactNode
  renderAdd: (day: string) => React.ReactNode
}): React.JSX.Element {
  const stretch = props.month === null
  return (
    <div
      className={cn(
        'relative border-b border-border',
        stretch ? 'min-h-0 flex-1' : 'min-h-24 shrink-0 grow'
      )}
    >
      <div className="absolute inset-0 grid grid-cols-7" aria-hidden>
        {props.days.map((day, index) => (
          <CalendarDayCell
            key={day}
            day={day}
            column={index}
            outsideMonth={props.month !== null && !isInMonth(day, props.month)}
            today={day === props.today}
            striped={props.striped}
            holidays={props.holidaysByDate.get(day) ?? NO_HOLIDAYS}
          />
        ))}
      </div>
      <div className={cn('relative grid grid-cols-7', stretch && 'h-full')}>
        {props.days.map((day) => (
          <div
            key={day}
            data-calendar-day={day}
            className={cn(
              'group/day relative flex min-w-0 flex-col gap-1 px-1 pt-7 pb-1.5',
              stretch && 'scrollbar-sleek overflow-y-auto'
            )}
          >
            {/* Why: the add button stays out of the way until the day is hovered or it is in use. */}
            <div className="absolute top-0.5 right-0.5 opacity-0 transition-opacity group-hover/day:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
              {props.renderAdd(day)}
            </div>
            {(props.tasksByDay.get(day) ?? NO_TASKS).map(props.renderTask)}
          </div>
        ))}
      </div>
    </div>
  )
}
