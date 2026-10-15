import { Star } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MicrosoftTodoTask } from '../../../../shared/microsoft-todo-types'

/** One task on the calendar: tick it in place, click the title to open its details. */
export function TodoCalendarTaskChip(props: {
  task: MicrosoftTodoTask
  today: string
  /** Second line, e.g. the list name; month cells leave it out to stay one line. */
  detail?: string | null
  compact: boolean
  selected: boolean
  pending: boolean
  onCompletedChange: (completed: boolean) => void
  onSelect: () => void
}): React.JSX.Element {
  const { task } = props
  const overdue = !task.completed && task.dueDate !== null && task.dueDate < props.today
  return (
    <div
      data-todo-chip={task.id}
      className={cn(
        'flex min-w-0 items-start gap-1.5 rounded-md border bg-card px-1.5 py-1 text-xs',
        props.selected ? 'border-ring' : 'border-border',
        task.completed && 'opacity-70'
      )}
    >
      <Checkbox
        checked={task.completed}
        disabled={props.pending}
        aria-label={
          task.completed
            ? translate('auto.components.todoPanel.row.markOpen', 'Mark as not completed')
            : translate('auto.components.todoPanel.row.markDone', 'Mark as completed')
        }
        onCheckedChange={(checked) => props.onCompletedChange(checked === true)}
      />
      <button
        type="button"
        aria-pressed={props.selected}
        onClick={props.onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <span
          className={cn(
            'block leading-4',
            props.compact ? 'truncate' : 'break-words',
            task.completed && 'text-muted-foreground line-through',
            overdue && 'text-destructive'
          )}
        >
          {task.title}
        </span>
        {props.detail ? (
          <span className="block truncate text-[11px] leading-4 text-muted-foreground">
            {props.detail}
          </span>
        ) : null}
      </button>
      {task.important ? (
        <Star
          aria-label={translate('auto.components.todoPanel.row.important', 'Important')}
          className="mt-0.5 size-3 shrink-0 fill-current text-status-warning"
        />
      ) : null}
    </div>
  )
}
