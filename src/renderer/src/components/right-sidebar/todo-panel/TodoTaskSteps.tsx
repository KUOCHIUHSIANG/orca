import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { useMountedRef } from '@/hooks/useMountedRef'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type {
  MicrosoftTodoChecklistItem,
  MicrosoftTodoTask
} from '../../../../../shared/microsoft-todo-types'

// Why: re-expanding a task paints its steps immediately; the fetch then refreshes them.
const cachedSteps = new Map<string, MicrosoftTodoChecklistItem[]>()

/** A task's existing To Do steps: tick and remove, each synced straight to Microsoft.
 *  No adding: Apple Reminders hides steps, so new ones would be invisible there. */
export function TodoTaskSteps(props: { task: MicrosoftTodoTask }): React.JSX.Element {
  const { task } = props
  const mountedRef = useMountedRef()
  const [steps, setSteps] = useState(cachedSteps.get(task.id) ?? null)
  const [failed, setFailed] = useState(false)
  const ids = { listId: task.listId, taskId: task.id }

  const write = (next: MicrosoftTodoChecklistItem[]): void => {
    cachedSteps.set(task.id, next)
    if (mountedRef.current) {
      setSteps(next)
    }
  }

  useEffect(() => {
    void window.api.microsoftTodo
      .fetchChecklist({ listId: task.listId, taskId: task.id })
      .then((result) => {
        if (result.ok) {
          cachedSteps.set(task.id, result.items)
        }
        if (mountedRef.current) {
          setSteps(result.ok ? result.items : null)
          setFailed(!result.ok)
        }
      })
      .catch(() => mountedRef.current && setFailed(true))
  }, [mountedRef, task.id, task.listId])

  const run = (before: MicrosoftTodoChecklistItem[], request: Promise<{ ok: boolean }>): void => {
    void request
      .catch(() => ({ ok: false }))
      .then((result) => {
        if (!result.ok) {
          // Why: a refused change rolls back so the list never shows something To Do lacks.
          write(before)
          if (mountedRef.current) {
            setFailed(true)
          }
        }
      })
  }

  const current = steps ?? []
  // Why: steps arrive after the row opens, so they grow into view instead of jumping in;
  // most tasks have none, so there is no loading line to flash.
  return (
    <Collapsible open={current.length > 0 || failed}>
      {/* Why: the side padding keeps checkbox focus rings inside the clipped animation box. */}
      <CollapsibleContent animation="height" className="-mx-1">
        <div className="space-y-1 px-1 pt-3">
          {failed ? (
            <p className="text-muted-foreground">
              {translate('auto.components.todoPanel.details.stepsFailed', 'Could not load steps.')}
            </p>
          ) : null}
          {current.map((step) => (
            <div key={step.id} className="group/step flex items-start gap-2">
              <Checkbox
                className="mt-0.5"
                checked={step.checked}
                aria-label={step.title}
                onCheckedChange={(checked) => {
                  write(
                    current.map((entry) =>
                      entry.id === step.id ? { ...entry, checked: checked === true } : entry
                    )
                  )
                  run(
                    current,
                    window.api.microsoftTodo.setChecklistItemChecked({
                      ...ids,
                      itemId: step.id,
                      checked: checked === true
                    })
                  )
                }}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 break-words leading-5',
                  step.checked && 'text-muted-foreground line-through'
                )}
              >
                {step.title}
              </span>
              <span className="opacity-0 transition-opacity group-hover/step:opacity-100 focus-within:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate('auto.components.todoPanel.steps.remove', 'Remove step')}
                  onClick={() => {
                    write(current.filter((entry) => entry.id !== step.id))
                    run(
                      current,
                      window.api.microsoftTodo.deleteChecklistItem({ ...ids, itemId: step.id })
                    )
                  }}
                >
                  <X />
                </Button>
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
