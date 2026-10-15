import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getIntlLocale } from '@/i18n/i18n'

// 2026-01-04 is a Sunday; calendars here are Sunday-first.
const SUNDAY_UTC_MS = Date.UTC(2026, 0, 4)
const DAY_MS = 86_400_000

export function isWeekendColumn(column: number): boolean {
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

/** Sunday-first weekday names over a 7-column calendar; weekends dimmed like their cells. */
export function CalendarWeekdayHeader(): React.JSX.Element {
  const labels = useWeekdayLabels()
  return (
    <div className="grid shrink-0 grid-cols-7 border-b border-border pb-1.5">
      {labels.map((label, index) => (
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
  )
}
