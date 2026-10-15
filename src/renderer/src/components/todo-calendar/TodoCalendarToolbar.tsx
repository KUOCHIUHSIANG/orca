import { ChevronLeft, ChevronRight, ListTodo, RefreshCw } from 'lucide-react'
import { CalendarIconAction } from '@/components/calendar/CalendarIconAction'
import { CalendarSourceFilter } from '@/components/calendar/CalendarSourceFilter'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MicrosoftTodoList } from '../../../../shared/microsoft-todo-types'
import type { TodoCalendarView } from './todo-calendar-model'

export function TodoCalendarToolbar(props: {
  view: TodoCalendarView
  onViewChange: (view: TodoCalendarView) => void
  periodLabel: string
  onShift: (delta: number) => void
  onToday: () => void
  lists: readonly MicrosoftTodoList[]
  selectedListIds: readonly string[] | null
  onSelectedListIdsChange: (next: string[] | null) => void
  showCompleted: boolean
  onShowCompletedChange: (showCompleted: boolean) => void
  loading: boolean
  onRefresh: () => void
}): React.JSX.Element {
  const week = props.view === 'week'
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Tabs
        value={props.view}
        onValueChange={(value) => props.onViewChange(value === 'month' ? 'month' : 'week')}
      >
        <TabsList>
          <TabsTrigger value="week">
            {translate('auto.components.todoCalendar.view.week', 'Week')}
          </TabsTrigger>
          <TabsTrigger value="month">
            {translate('auto.components.todoCalendar.view.month', 'Month')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-1">
        <CalendarIconAction
          label={
            week
              ? translate('auto.components.todoCalendar.previousWeek', 'Previous week')
              : translate('auto.components.todoPanel.due.previousMonth', 'Previous month')
          }
          onClick={() => props.onShift(-1)}
        >
          <ChevronLeft />
        </CalendarIconAction>
        <span className="min-w-28 text-center text-sm font-medium tabular-nums">
          {props.periodLabel}
        </span>
        <CalendarIconAction
          label={
            week
              ? translate('auto.components.todoCalendar.nextWeek', 'Next week')
              : translate('auto.components.todoPanel.due.nextMonth', 'Next month')
          }
          onClick={() => props.onShift(1)}
        >
          <ChevronRight />
        </CalendarIconAction>
        <Button type="button" variant="outline" size="sm" onClick={props.onToday}>
          {translate('auto.components.todoPanel.due.today', 'Today')}
        </Button>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {props.lists.length > 1 ? (
          <CalendarSourceFilter
            sources={props.lists}
            selectedIds={props.selectedListIds}
            onChange={props.onSelectedListIdsChange}
            label={translate('auto.components.todoCalendar.lists', 'Lists')}
            allLabel={translate('auto.components.todoCalendar.allLists', 'All lists')}
            icon={<ListTodo className="size-3.5 text-muted-foreground" />}
          />
        ) : null}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={props.showCompleted} onCheckedChange={props.onShowCompletedChange} />
          {translate('auto.components.todoCalendar.showCompleted', 'Show completed')}
        </label>
        <CalendarIconAction
          label={translate('auto.components.todoCalendar.refresh', 'Refresh')}
          disabled={props.loading}
          onClick={props.onRefresh}
        >
          <RefreshCw className={cn(props.loading && 'animate-spin')} />
        </CalendarIconAction>
      </div>
    </div>
  )
}
