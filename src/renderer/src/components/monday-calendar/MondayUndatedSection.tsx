import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MondayCalendarItem } from '../../../../shared/monday-calendar-types'
import { MondayStatusDot } from './MondayStatusDot'

export function MondayUndatedSection(props: {
  items: readonly MondayCalendarItem[]
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  ownerNamesFor: (item: MondayCalendarItem) => string[]
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
}): React.JSX.Element | null {
  if (props.items.length === 0) {
    return null
  }
  return (
    <section className="mx-3 mb-3 shrink-0 overflow-hidden rounded-md border border-border md:mx-5">
      <button
        type="button"
        aria-expanded={props.expanded}
        onClick={() => props.onExpandedChange(!props.expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ChevronRight
          className={cn('size-3.5 transition-transform', props.expanded && 'rotate-90')}
        />
        {translate('auto.components.mondayCalendar.undated.title', 'No date')}
        <span className="tabular-nums">{props.items.length}</span>
      </button>
      {props.expanded ? (
        <ul className="scrollbar-sleek max-h-44 overflow-y-auto border-t border-border p-1">
          {props.items.map((item) => {
            const owners = props.ownerNamesFor(item)
            const context = item.groupTitle
              ? `${item.boardName} · ${item.groupTitle}`
              : item.boardName
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={item.id === props.selectedItemId}
                  onClick={() => props.onSelectItem(item.id)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors hover:bg-accent',
                    item.id === props.selectedItemId && 'bg-accent',
                    item.isDone && 'text-muted-foreground'
                  )}
                >
                  <MondayStatusDot color={item.statusColor} />
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span className="ml-auto max-w-[45%] shrink-0 truncate text-muted-foreground">
                    {owners.length > 0 ? `${owners.join(', ')} · ${context}` : context}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
