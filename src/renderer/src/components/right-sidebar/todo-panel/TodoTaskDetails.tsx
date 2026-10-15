import { Check, Loader2, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'
import { TodoDueDatePicker } from './TodoDueDatePicker'
import { TodoTaskSteps } from './TodoTaskSteps'
import type { TodoTaskChanges } from './todo-task-edits'

function formatInstant(value: string, withTime: boolean): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
  }).format(new Date(value))
}

function Fact(props: { label: string; value: string }): React.JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0">{props.value}</dd>
    </>
  )
}

/** Expanded editor under a task row. Edits stay a draft until Save (or collapsing the row). */
export function TodoTaskDetails(props: {
  task: MicrosoftTodoTask
  today: string
  edits: TodoTaskChanges
  dirty: boolean
  /** Save is waiting on Microsoft; the form locks so the reply cannot overwrite newer typing. */
  saving: boolean
  onEdit: (edits: TodoTaskChanges) => void
  onSave: () => void
  onDelete: () => void
}): React.JSX.Element {
  const { task, edits, onEdit } = props
  const dueDate = edits.dueDate !== undefined ? edits.dueDate : task.dueDate
  const important = edits.important ?? task.important
  return (
    <form
      className="pt-2 pb-1 text-xs"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSave()
      }}
    >
      <fieldset disabled={props.saving} className="min-w-0 space-y-3">
        <Input
          value={edits.title ?? task.title}
          maxLength={255}
          aria-label={translate('auto.components.todoPanel.details.title', 'Title')}
          className="h-8"
          onChange={(event) => onEdit({ title: event.target.value })}
        />
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TodoDueDatePicker
              value={dueDate}
              today={props.today}
              disabled={props.saving}
              onChange={(next) => onEdit({ dueDate: next })}
            />
            <Button
              type="button"
              variant={important ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={important}
              onClick={() => onEdit({ important: !important })}
            >
              <Star className={cn(important && 'fill-current text-status-warning')} />
              {translate('auto.components.todoPanel.row.important', 'Important')}
            </Button>
          </div>
          <TodoTaskSteps task={task} />
        </div>
        <Textarea
          value={edits.notes ?? task.notes ?? ''}
          rows={3}
          placeholder={translate(
            'auto.components.todoPanel.details.notesPlaceholder',
            'Add a note'
          )}
          aria-label={translate('auto.components.todoPanel.details.notes', 'Notes')}
          onChange={(event) => onEdit({ notes: event.target.value })}
        />
        {task.reminderAt || task.createdAt ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {task.reminderAt ? (
              <Fact
                label={translate('auto.components.todoPanel.details.reminder', 'Reminder')}
                value={formatInstant(task.reminderAt, true)}
              />
            ) : null}
            {task.createdAt ? (
              <Fact
                label={translate('auto.components.todoPanel.details.created', 'Created')}
                value={formatInstant(task.createdAt, false)}
              />
            ) : null}
          </dl>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="submit" size="xs" disabled={!props.dirty}>
            {props.saving ? <Loader2 className="animate-spin" /> : <Check />}
            {translate('auto.components.todoPanel.details.save', 'Save')}
          </Button>
          <Button type="button" variant="destructive" size="xs" onClick={props.onDelete}>
            <Trash2 />
            {translate('auto.components.todoPanel.delete.button', 'Delete task')}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
