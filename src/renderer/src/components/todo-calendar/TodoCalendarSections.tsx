import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MicrosoftTodoTask } from '../../../../shared/microsoft-todo-types'

function Section(props: {
  title: string
  tasks: readonly MicrosoftTodoTask[]
  defaultOpen: boolean
  tone: 'destructive' | 'muted'
  renderTask: (task: MicrosoftTodoTask) => React.ReactNode
}): React.JSX.Element | null {
  const [open, setOpen] = useState(props.defaultOpen)
  if (props.tasks.length === 0) {
    return null
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex items-center gap-1 py-1 text-[11px] font-semibold tracking-wide uppercase hover:text-foreground',
          props.tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        <ChevronRight
          className={cn(
            'size-3 transition-transform motion-reduce:transition-none',
            open && 'rotate-90'
          )}
        />
        {props.title} · {props.tasks.length}
      </button>
      <CollapsibleContent animation="height">
        <div className="scrollbar-sleek grid max-h-40 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-1.5 overflow-y-auto pb-2">
          {props.tasks.map(props.renderTask)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Tasks the grid can't place: overdue ones from before the visible period, and undated ones. */
export function TodoCalendarSections(props: {
  overdue: readonly MicrosoftTodoTask[]
  undated: readonly MicrosoftTodoTask[]
  renderTask: (task: MicrosoftTodoTask) => React.ReactNode
}): React.JSX.Element | null {
  if (props.overdue.length === 0 && props.undated.length === 0) {
    return null
  }
  return (
    <div className="shrink-0 space-y-1 px-3 pb-2 md:px-5">
      <Section
        title={translate('auto.components.todoPanel.group.overdue', 'Overdue')}
        tasks={props.overdue}
        defaultOpen
        tone="destructive"
        renderTask={props.renderTask}
      />
      <Section
        title={translate('auto.components.todoPanel.group.noDate', 'No due date')}
        tasks={props.undated}
        defaultOpen={false}
        tone="muted"
        renderTask={props.renderTask}
      />
    </div>
  )
}
