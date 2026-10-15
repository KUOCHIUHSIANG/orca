import { useMemo, useRef, useState } from 'react'
import { CalendarWeekdayHeader } from '@/components/calendar/CalendarWeekdayHeader'
import { addDays, monthCursorOfIso, parseIsoDate } from '@/components/calendar/calendar-dates'
import { useCalendarPanelEscape } from '@/components/calendar/use-calendar-panel-escape'
import { useTaiwanHolidays } from '@/components/calendar/use-taiwan-holidays'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { MicrosoftTodoTask } from '../../../../shared/microsoft-todo-types'
import { TodoConnectForm } from '../right-sidebar/todo-panel/TodoConnectForm'
import { TodoFailureBanner } from '../right-sidebar/todo-panel/TodoFailureBanner'
import { dueLabel, localToday } from '../right-sidebar/todo-panel/todo-due-dates'
import { useTodoCompletionSettle } from '../right-sidebar/todo-panel/use-todo-completion-settle'
import { useTodoTaskMutations } from '../right-sidebar/todo-panel/use-todo-task-mutations'
import { TodoCalendarAddPopover } from './TodoCalendarAddPopover'
import { TodoCalendarSections } from './TodoCalendarSections'
import { TodoCalendarTaskChip } from './TodoCalendarTaskChip'
import { TodoCalendarTaskPanel } from './TodoCalendarTaskPanel'
import { TodoCalendarToolbar } from './TodoCalendarToolbar'
import { TodoCalendarWeekRow } from './TodoCalendarWeekRow'
import {
  calendarPeriod,
  overdueBeforePeriod,
  shiftAnchor,
  tasksByDay,
  undatedTodoTasks,
  visibleTodoTasks,
  type TodoCalendarPeriod,
  type TodoCalendarView
} from './todo-calendar-model'
import { useTodoCalendar } from './use-todo-calendar'

// Why: the list filter outlives a visit to another page; the view always reopens on this week.
let rememberedListIds: string[] | null = null

type ChipPlace = 'week' | 'month' | 'overdue' | 'undated'

function periodLabel(view: TodoCalendarView, period: TodoCalendarPeriod, today: string): string {
  const locale = getIntlLocale()
  if (view === 'month') {
    const month = monthCursorOfIso(period.weeks[1]?.[0] ?? period.start)
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(
      new Date(month.year, month.month, 1)
    )
  }
  const last = addDays(period.end, -1)
  const withYear = period.start.slice(0, 4) !== today.slice(0, 4)
  const format = new Intl.DateTimeFormat(locale, {
    ...(withYear ? { year: 'numeric' as const } : {}),
    month: 'numeric',
    day: 'numeric'
  })
  return `${format.format(parseIsoDate(period.start))} – ${format.format(parseIsoDate(last))}`
}

export default function TodoCalendarPage(): React.JSX.Element {
  const [today] = useState(localToday)
  const [view, setView] = useState<TodoCalendarView>('week')
  const [anchor, setAnchor] = useState(today)
  const [showCompleted, setShowCompleted] = useState(false)
  const [selectedListIds, setSelectedListIds] = useState(rememberedListIds)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const period = useMemo(() => calendarPeriod(view, anchor), [view, anchor])
  const todo = useTodoCalendar(showCompleted ? { from: period.start, to: period.end } : null)
  const mutations = useTodoTaskMutations(todo)
  const completion = useTodoCompletionSettle()
  const status = todo.status
  const connected = status?.clientIdConfigured === true && status.signedIn
  const holidaysByDate = useTaiwanHolidays(connected)

  const lists = useMemo(() => todo.lists ?? [], [todo.lists])
  const listNames = useMemo(() => new Map(lists.map((list) => [list.id, list.name])), [lists])
  const defaultListId =
    (lists.find((list) => list.wellKnownName === 'defaultList') ?? lists[0])?.id ?? null
  const visible = useMemo(
    () =>
      visibleTodoTasks(todo.tasks ?? [], {
        selectedListIds,
        showCompleted,
        settlingIds: new Set(completion.phases.keys())
      }),
    [completion.phases, selectedListIds, showCompleted, todo.tasks]
  )
  const byDay = useMemo(() => tasksByDay(visible), [visible])
  const overdue = useMemo(
    () => overdueBeforePeriod(visible, period, today),
    [period, today, visible]
  )
  const undated = useMemo(() => undatedTodoTasks(visible), [visible])
  // Why: a task hidden by the filters closes its panel instead of lingering out of view.
  const selectedTask = visible.find((task) => task.id === selectedTaskId) ?? null
  useCalendarPanelEscape(selectedTask !== null, containerRef, () => setSelectedTaskId(null))

  const listName = (task: MicrosoftTodoTask): string | null =>
    lists.length > 1 ? (listNames.get(task.listId) ?? null) : null
  const renderChip = (place: ChipPlace) => (task: MicrosoftTodoTask) => (
    <TodoCalendarTaskChip
      key={task.id}
      task={task}
      today={today}
      compact={place === 'month'}
      detail={
        place === 'month'
          ? null
          : place === 'overdue' && task.dueDate
            ? [dueLabel(task.dueDate, today), listName(task)].filter(Boolean).join(' · ')
            : listName(task)
      }
      selected={task.id === selectedTask?.id}
      pending={todo.pendingTaskIds.has(task.id)}
      onCompletedChange={(completed) => {
        todo.setCompleted(task, completed)
        if (completed) {
          completion.settle(task.id)
        } else {
          completion.cancel(task.id)
        }
      }}
      onSelect={() => setSelectedTaskId((current) => (current === task.id ? null : task.id))}
    />
  )
  const renderAdd = (day: string): React.ReactNode =>
    defaultListId ? (
      <TodoCalendarAddPopover
        day={day}
        today={today}
        lists={lists}
        defaultListId={defaultListId}
        onCreate={todo.createTask}
      />
    ) : null
  const rowProps = {
    today,
    holidaysByDate,
    tasksByDay: byDay,
    renderAdd,
    renderTask: renderChip(view)
  }

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground md:pt-6">
      <header
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-3 pb-3 md:px-5"
        // Why: no stacked center titlebar on this page; keep the controls clear of Windows/Linux window controls.
        style={{ paddingRight: 'max(0.75rem, var(--window-controls-width, 0px))' }}
      >
        <h1 className="truncate text-base font-semibold leading-8">
          {translate('auto.components.sidebar.SidebarNav.todo', 'To Do')}
        </h1>
        {connected ? (
          <TodoCalendarToolbar
            view={view}
            onViewChange={setView}
            periodLabel={periodLabel(view, period, today)}
            onShift={(delta) => setAnchor((current) => shiftAnchor(view, current, delta))}
            onToday={() => setAnchor(today)}
            lists={lists}
            selectedListIds={selectedListIds}
            onSelectedListIdsChange={(next) => {
              rememberedListIds = next
              setSelectedListIds(next)
            }}
            showCompleted={showCompleted}
            onShowCompletedChange={setShowCompleted}
            loading={todo.loading}
            onRefresh={() => void todo.refresh()}
          />
        ) : null}
      </header>
      {todo.error ? (
        <TodoFailureBanner
          failure={todo.error}
          onSignIn={todo.signIn}
          onFailure={todo.reportError}
        />
      ) : null}
      {status === null ? null : !connected ? (
        <div className="scrollbar-sleek flex min-h-0 flex-1 justify-center overflow-y-auto px-3 pt-8">
          <div className="h-fit w-full max-w-sm rounded-lg border border-border">
            <TodoConnectForm
              status={status}
              onSaveClientId={todo.setClientId}
              onSignIn={todo.signIn}
            />
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <TodoCalendarSections
              overdue={overdue}
              undated={undated}
              renderTask={(task) => renderChip(task.dueDate === null ? 'undated' : 'overdue')(task)}
            />
            <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 md:px-5">
              <CalendarWeekdayHeader />
              {view === 'week' ? (
                <TodoCalendarWeekRow
                  days={period.weeks[0]}
                  month={null}
                  striped={false}
                  {...rowProps}
                />
              ) : (
                <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto">
                  {period.weeks.map((days, index) => (
                    <TodoCalendarWeekRow
                      key={days[0]}
                      days={days}
                      month={monthCursorOfIso(anchor)}
                      striped={index % 2 === 1}
                      {...rowProps}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          {selectedTask ? (
            <TodoCalendarTaskPanel
              key={selectedTask.id}
              task={selectedTask}
              listName={listNames.get(selectedTask.listId) ?? null}
              today={today}
              onUpdate={(changes) => mutations.updateTask(selectedTask, changes)}
              onDelete={() => {
                setSelectedTaskId(null)
                mutations.deleteTask(selectedTask)
              }}
              onClose={() => setSelectedTaskId(null)}
            />
          ) : null}
        </div>
      )}
    </main>
  )
}
