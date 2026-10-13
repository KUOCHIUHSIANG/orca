import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, LogOut, MoreHorizontal, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'
import { describeTodoFailure } from './todo-failure-copy'
import { groupTodoTasks, type TodoTaskGroupKey } from './todo-task-groups'
import { TodoConnectForm } from './TodoConnectForm'
import { TodoQuickAdd } from './TodoQuickAdd'
import { TodoTaskRow } from './TodoTaskRow'
import { useMicrosoftTodo } from './use-microsoft-todo'
import { useTodoCompletionSettle } from './use-todo-completion-settle'
import { useTodoTaskMutations } from './use-todo-task-mutations'

function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function groupTitle(key: TodoTaskGroupKey): string {
  switch (key) {
    case 'overdue':
      return translate('auto.components.todoPanel.group.overdue', 'Overdue')
    case 'today':
      return translate('auto.components.todoPanel.group.today', 'Today')
    case 'upcoming':
      return translate('auto.components.todoPanel.group.upcoming', 'Upcoming')
    case 'no-date':
      return translate('auto.components.todoPanel.group.noDate', 'No due date')
  }
}

export default function TodoPanel(props: { isVisible: boolean }): React.JSX.Element {
  // Why: translate() is not reactive; subscribing re-renders the panel when the UI language changes.
  useTranslation()
  const todo = useMicrosoftTodo(props.isVisible)
  const mutations = useTodoTaskMutations(todo)
  const completion = useTodoCompletionSettle()
  const [today] = useState(localToday)
  const [completedOpen, setCompletedOpen] = useState(false)
  const groups = useMemo(
    () => groupTodoTasks(todo.tasks ?? [], today, new Set(completion.phases.keys())),
    [completion.phases, todo.tasks, today]
  )
  const { status } = todo
  const connected = status?.signedIn === true

  const renderRow = (task: MicrosoftTodoTask): React.JSX.Element => (
    <TodoTaskRow
      key={task.id}
      task={task}
      today={today}
      pending={todo.pendingTaskIds.has(task.id)}
      settle={completion.phases.get(task.id)}
      onCompletedChange={(completed) => {
        todo.setCompleted(task, completed)
        if (completed) {
          completion.settle(task.id)
        } else {
          completion.cancel(task.id)
        }
      }}
      onUpdate={(changes) => mutations.updateTask(task, changes)}
      onDelete={() => mutations.deleteTask(task)}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-1 border-b border-border py-2 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {translate('auto.components.right.sidebar.index.todos', 'To Do')}
          </div>
          {connected && status.accountName ? (
            <div className="truncate text-xs text-muted-foreground">{status.accountName}</div>
          ) : null}
        </div>
        {connected ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('auto.components.todoPanel.refresh', 'Refresh')}
                  disabled={todo.loading}
                  onClick={todo.refresh}
                >
                  <RefreshCw className={cn(todo.loading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {translate('auto.components.todoPanel.refresh', 'Refresh')}
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('auto.components.todoPanel.more', 'More actions')}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={todo.signOut}>
                  <LogOut className="size-3.5" />
                  {translate('auto.components.todoPanel.signOut', 'Sign out of Microsoft')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </div>
      {status === null ? null : !connected ? (
        <TodoConnectForm status={status} onSaveClientId={todo.setClientId} onSignIn={todo.signIn} />
      ) : (
        <>
          <div className="space-y-2 border-b border-border px-3 py-3">
            {todo.lists && todo.lists.length > 1 ? (
              <Select value={todo.listId ?? undefined} onValueChange={todo.selectList}>
                <SelectTrigger
                  size="sm"
                  className="w-full"
                  aria-label={translate('auto.components.todoPanel.list', 'List')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {todo.lists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <TodoQuickAdd disabled={!todo.listId} onCreate={todo.createTask} />
          </div>
          {todo.error ? (
            <p role="alert" className="border-b border-border px-4 py-2 text-xs text-destructive">
              {describeTodoFailure(todo.error)}
            </p>
          ) : null}
          <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {todo.tasks && groups.open.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {translate('auto.components.todoPanel.empty', 'Nothing to do. Nice.')}
              </p>
            ) : null}
            {/* Why: one flat keyed list, so a row whose date moves it to another group keeps its
                state (open editor, draft) instead of remounting. */}
            {groups.open.flatMap((group) => [
              <h3
                key={`group:${group.key}`}
                className={cn(
                  'px-2 pt-3 pb-0.5 text-[11px] font-semibold tracking-wide uppercase first:pt-1',
                  group.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {groupTitle(group.key)} · {group.tasks.length}
              </h3>,
              ...group.tasks.map(renderRow)
            ])}
            {groups.completed.length > 0 ? (
              <Collapsible open={completedOpen} onOpenChange={setCompletedOpen} className="mt-2">
                <button
                  type="button"
                  aria-expanded={completedOpen}
                  onClick={() => setCompletedOpen((open) => !open)}
                  className="flex w-full items-center gap-1 px-2 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
                >
                  <ChevronRight
                    className={cn(
                      'size-3 transition-transform motion-reduce:transition-none',
                      completedOpen && 'rotate-90'
                    )}
                  />
                  {translate('auto.components.todoPanel.group.completed', 'Completed')} ·{' '}
                  {groups.completed.length}
                </button>
                <CollapsibleContent animation="height">
                  {groups.completed.map(renderRow)}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
