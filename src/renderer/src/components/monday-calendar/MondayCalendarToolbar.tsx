import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import type { MondayBoardSummary, MondayPerson } from '../../../../shared/monday-calendar-types'
import { MondayBoardFilter } from './MondayBoardFilter'
import { MondayIconAction } from './MondayIconAction'
import { MondayPeopleFilter } from './MondayPeopleFilter'
import { monthCursorOf, shiftMonth, type MonthCursor } from './monday-month-layout'

function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

export function MondayCalendarToolbar(props: {
  cursor: MonthCursor
  onCursorChange: (cursor: MonthCursor) => void
  boards: readonly MondayBoardSummary[]
  selectedBoardIds: readonly string[] | null
  onSelectedBoardIdsChange: (next: string[] | null) => void
  people: readonly MondayPerson[]
  selectedPersonIds: readonly string[] | null
  onSelectedPersonIdsChange: (next: string[] | null) => void
  showDone: boolean
  onShowDoneChange: (showDone: boolean) => void
  loading: boolean
  fetchedAt: number | null
  onRefresh: () => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const now = useMinuteTick()
  const monthLabel = new Intl.DateTimeFormat(getIntlLocale(), {
    year: 'numeric',
    month: 'long'
  }).format(new Date(props.cursor.year, props.cursor.month, 1))

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <MondayIconAction
          label={translate(
            'auto.components.mondayCalendar.toolbar.previousMonth',
            'Previous month'
          )}
          onClick={() => props.onCursorChange(shiftMonth(props.cursor, -1))}
        >
          <ChevronLeft />
        </MondayIconAction>
        <span className="w-28 text-center text-sm font-medium tabular-nums">{monthLabel}</span>
        <MondayIconAction
          label={translate('auto.components.mondayCalendar.toolbar.nextMonth', 'Next month')}
          onClick={() => props.onCursorChange(shiftMonth(props.cursor, 1))}
        >
          <ChevronRight />
        </MondayIconAction>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => props.onCursorChange(monthCursorOf(new Date()))}
        >
          {translate('auto.components.mondayCalendar.toolbar.today', 'Today')}
        </Button>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {props.boards.length > 1 ? (
          <MondayBoardFilter
            boards={props.boards}
            selectedBoardIds={props.selectedBoardIds}
            onChange={props.onSelectedBoardIdsChange}
          />
        ) : null}
        <MondayPeopleFilter
          people={props.people}
          selectedPersonIds={props.selectedPersonIds}
          onChange={props.onSelectedPersonIdsChange}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={props.showDone} onCheckedChange={props.onShowDoneChange} />
          {translate('auto.components.mondayCalendar.toolbar.showDone', 'Show done')}
        </label>
        {props.fetchedAt !== null ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {now - props.fetchedAt < 60_000
              ? translate(
                  'auto.components.mondayCalendar.toolbar.updatedJustNow',
                  'Updated just now'
                )
              : translate('auto.components.mondayCalendar.toolbar.updated', 'Updated {{value0}}', {
                  value0: formatUiRelativeTime(props.fetchedAt - now)
                })}
          </span>
        ) : null}
        <MondayIconAction
          label={translate('auto.components.mondayCalendar.toolbar.refresh', 'Refresh')}
          disabled={props.loading}
          onClick={props.onRefresh}
        >
          <RefreshCw className={cn(props.loading && 'animate-spin')} />
        </MondayIconAction>
        <MondayIconAction
          label={translate('auto.components.mondayCalendar.toolbar.settings', 'Monday settings')}
          onClick={props.onOpenSettings}
        >
          <Settings />
        </MondayIconAction>
      </div>
    </div>
  )
}
