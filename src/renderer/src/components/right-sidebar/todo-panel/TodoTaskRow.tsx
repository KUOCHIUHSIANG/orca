import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'
import { TodoTaskDetails } from './TodoTaskDetails'
import { dueLabel } from './todo-due-dates'
import { hasTodoChanges, pendingTodoChanges, type TodoTaskChanges } from './todo-task-edits'
import type { TodoSettlePhase } from './use-todo-completion-settle'

function RowIconButton(props: {
  label: string
  expanded?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={props.label}
          aria-expanded={props.expanded}
          onClick={props.onClick}
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {props.label}
      </TooltipContent>
    </Tooltip>
  )
}

export function TodoTaskRow(props: {
  task: MicrosoftTodoTask
  today: string
  pending: boolean
  settle?: TodoSettlePhase
  onCompletedChange: (completed: boolean) => void
  onUpdate: (changes: TodoTaskChanges) => Promise<boolean>
  onDelete: () => void
}): React.JSX.Element {
  const { task } = props
  const [expanded, setExpanded] = useState(false)
  const [edits, setEdits] = useState<TodoTaskChanges>({})
  const [saving, setSaving] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const shownDueRef = useRef(task.dueDate)
  const changes = pendingTodoChanges(task, edits)
  const dirty = hasTodoChanges(changes)
  const settling = props.settle !== undefined && task.completed
  const overdue = !task.completed && task.dueDate !== null && task.dueDate < props.today

  // Why: a saved date can move the row to another group; keep the open editor in view.
  useEffect(() => {
    if (shownDueRef.current === task.dueDate) {
      return
    }
    shownDueRef.current = task.dueDate
    if (expanded) {
      rowRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [expanded, task.dueDate])

  /** Sends the draft; it is cleared only once Microsoft accepts it, so a failed save can be retried. */
  const save = async (): Promise<boolean> => {
    if (!dirty) {
      return true
    }
    const sent = edits
    const saved = await props.onUpdate(changes)
    if (saved) {
      // Why: keep anything typed while the request was out; it already diffs against the saved task.
      setEdits((current) => (current === sent ? {} : current))
    }
    return saved
  }
  const saveAndCollapse = (): void => {
    setSaving(true)
    void save().then((saved) => {
      setSaving(false)
      if (saved) {
        setExpanded(false)
      }
    })
  }
  const toggle = (): void => {
    if (saving) {
      return
    }
    // Why: collapsing must not silently drop edits the user forgot to save.
    if (expanded) {
      void save()
    }
    setExpanded(!expanded)
  }

  return (
    <Collapsible open={!(props.settle === 'leaving' && task.completed)}>
      <CollapsibleContent animation="height">
        <div
          ref={rowRef}
          className={cn('group rounded-md px-2 py-1.5 hover:bg-accent', expanded && 'bg-accent/60')}
        >
          <div className="flex items-start gap-2.5">
            <Checkbox
              className="mt-0.5"
              checked={task.completed}
              disabled={props.pending}
              aria-label={
                task.completed
                  ? translate('auto.components.todoPanel.row.markOpen', 'Mark as not completed')
                  : translate('auto.components.todoPanel.row.markDone', 'Mark as completed')
              }
              onCheckedChange={(checked) => {
                void save()
                props.onCompletedChange(checked === true)
              }}
            />
            <button
              type="button"
              aria-expanded={expanded}
              onClick={toggle}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block text-[13px] leading-5 break-words">
                <span
                  data-todo-title
                  data-done={task.completed}
                  className={cn(task.completed && 'text-muted-foreground')}
                >
                  {task.title}
                </span>
              </span>
              {task.dueDate && (!task.completed || settling) ? (
                <span
                  className={cn(
                    'block text-xs',
                    overdue ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {dueLabel(task.dueDate, props.today)}
                </span>
              ) : null}
            </button>
            {task.important ? (
              <Star
                aria-label={translate('auto.components.todoPanel.row.important', 'Important')}
                className="mt-0.5 size-3.5 shrink-0 fill-current text-status-warning"
              />
            ) : null}
            <RowIconButton
              label={
                expanded
                  ? translate('auto.components.todoPanel.row.hideDetails', 'Hide details')
                  : translate('auto.components.todoPanel.row.showDetails', 'Show details')
              }
              expanded={expanded}
              onClick={toggle}
            >
              <ChevronDown
                className={cn(
                  'text-muted-foreground transition-transform motion-reduce:transition-none',
                  expanded && 'rotate-180'
                )}
              />
            </RowIconButton>
            {/* Why: the web app is a fallback, so its button stays out of the way until hover or expand. */}
            <span
              className={cn(
                'shrink-0 transition-opacity focus-within:opacity-100',
                expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
            >
              <RowIconButton
                label={translate(
                  'auto.components.todoPanel.row.openWeb',
                  'Open in To Do on the web'
                )}
                onClick={() => void window.api.shell.openUrl(task.webUrl)}
              >
                <ExternalLink />
              </RowIconButton>
            </span>
          </div>
          <Collapsible open={expanded}>
            <CollapsibleContent animation="height">
              {/* Why: right padding keeps input focus rings inside the clipped animation box. */}
              <div className="pr-1 pl-[26px]">
                <TodoTaskDetails
                  task={task}
                  today={props.today}
                  edits={edits}
                  dirty={dirty}
                  saving={saving}
                  onEdit={(next) => setEdits((current) => ({ ...current, ...next }))}
                  onSave={saveAndCollapse}
                  onDelete={() => {
                    setEdits({})
                    props.onDelete()
                  }}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
