import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getIntlLocale, translate } from '@/i18n/i18n'
import {
  addDays,
  dueLabel,
  fromIsoDate,
  monthGrid,
  monthOf,
  nextMonday,
  shiftMonth,
  type TodoMonth
} from './todo-due-dates'

const ARROW_STEPS = new Map([
  ['ArrowLeft', -1],
  ['ArrowRight', 1],
  ['ArrowUp', -7],
  ['ArrowDown', 7]
])

function formatDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getIntlLocale(), options).format(fromIsoDate(iso))
}

/** Due date button opening quick picks and a month grid; arrow keys move between days. */
export function TodoDueDatePicker(props: {
  value: string | null
  today: string
  disabled?: boolean
  onChange: (value: string | null) => void
}): React.JSX.Element {
  const { value, today } = props
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<TodoMonth>(() => monthOf(value ?? today))
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const days = monthGrid(month)
  const inMonth = (iso: string | null): iso is string =>
    iso !== null && days.some((day) => day.iso === iso && day.inMonth)
  // Why one tab stop: 42 day buttons would otherwise each take a Tab press.
  const tabStop = [focusDay, value, today].find(inMonth) ?? days.find((day) => day.inMonth)?.iso

  useEffect(() => {
    if (focusDay) {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus()
    }
  }, [focusDay, month])

  const pick = (next: string | null): void => {
    props.onChange(next)
    setOpen(false)
  }
  const quickPicks = [
    { iso: today, label: translate('auto.components.todoPanel.due.today', 'Today') },
    {
      iso: addDays(today, 1),
      label: translate('auto.components.todoPanel.due.tomorrow', 'Tomorrow')
    },
    {
      iso: nextMonday(today),
      label: translate('auto.components.todoPanel.due.nextWeek', 'Next week')
    }
  ]
  const weekdays = days
    .slice(0, 7)
    .map((day) => ({ iso: day.iso, label: formatDate(day.iso, { weekday: 'narrow' }) }))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setMonth(monthOf(value ?? today))
          setFocusDay(null)
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="xs" disabled={props.disabled}>
          <CalendarDays />
          {value
            ? dueLabel(value, today)
            : translate('auto.components.todoPanel.add.dueDate', 'Due date')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="p-2">
          <div className="grid grid-cols-3 gap-1">
            {quickPicks.map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={value === option.iso}
                onClick={() => pick(option.iso)}
                className={cn(
                  'flex flex-col items-center rounded-md px-1 py-1 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                  value === option.iso && 'bg-accent'
                )}
              >
                <span className="font-medium">{option.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDate(option.iso, { month: 'numeric', day: 'numeric', weekday: 'short' })}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={translate(
                'auto.components.todoPanel.due.previousMonth',
                'Previous month'
              )}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft />
            </Button>
            <span className="text-xs font-medium">
              {new Intl.DateTimeFormat(getIntlLocale(), { year: 'numeric', month: 'long' }).format(
                new Date(month.year, month.month, 1)
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={translate('auto.components.todoPanel.due.nextMonth', 'Next month')}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="mt-1 grid grid-cols-7 text-center text-[11px] text-muted-foreground">
            {weekdays.map((weekday) => (
              <span key={weekday.iso} className="py-1">
                {weekday.label}
              </span>
            ))}
          </div>
          <div
            ref={gridRef}
            className="grid grid-cols-7 gap-0.5"
            onKeyDown={(event) => {
              const step = ARROW_STEPS.get(event.key)
              const current = event.target instanceof HTMLElement ? event.target.dataset.day : null
              if (step === undefined || !current) {
                return
              }
              event.preventDefault()
              const next = addDays(current, step)
              setMonth(monthOf(next))
              setFocusDay(next)
            }}
          >
            {days.map((day) => (
              <button
                key={day.iso}
                type="button"
                data-day={day.iso}
                tabIndex={day.iso === tabStop ? 0 : -1}
                aria-label={formatDate(day.iso, { dateStyle: 'full' })}
                aria-pressed={day.iso === value}
                aria-current={day.iso === today ? 'date' : undefined}
                onClick={() => pick(day.iso)}
                className={cn(
                  'h-7 rounded-md text-xs tabular-nums hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                  !day.inMonth && 'text-muted-foreground/50',
                  day.iso === today && 'font-semibold ring-1 ring-border ring-inset',
                  day.iso === value && 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {fromIsoDate(day.iso).getDate()}
              </button>
            ))}
          </div>
          {value ? (
            <div className="mt-2 border-t border-border pt-2">
              <Button type="button" variant="ghost" size="xs" onClick={() => pick(null)}>
                <X />
                {translate('auto.components.todoPanel.details.clearDue', 'Clear due date')}
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
