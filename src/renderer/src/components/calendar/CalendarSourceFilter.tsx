import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { toggleSourceSelection } from './calendar-source-selection'

export type CalendarSource = { id: string; name: string }

function triggerLabel(
  sources: readonly CalendarSource[],
  selected: readonly string[] | null,
  allLabel: string
): string {
  const names = selected
    ? sources.filter((source) => selected.includes(source.id)).map((source) => source.name)
    : []
  if (names.length === 0) {
    return allLabel
  }
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`
}

/** Multi-select over a calendar's sources (boards, lists); `null` selection means all of them. */
export function CalendarSourceFilter(props: {
  sources: readonly CalendarSource[]
  selectedIds: readonly string[] | null
  onChange: (next: string[] | null) => void
  label: string
  allLabel: string
  icon: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const selected = props.selectedIds
  const sourceIds = props.sources.map((source) => source.id)
  const isChecked = (sourceId: string): boolean => !selected || selected.includes(sourceId)
  const checkedCount = selected ? selected.length : sourceIds.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={props.label}
          className="max-w-56"
        >
          {props.icon}
          <span className="truncate">{triggerLabel(props.sources, selected, props.allLabel)}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <Command>
          <CommandList>
            <CommandItem value="__all_sources__" onSelect={() => props.onChange(null)}>
              <Check className={cn('size-3.5 text-muted-foreground', selected && 'opacity-0')} />
              {props.allLabel}
            </CommandItem>
            {props.sources.map((source) => (
              <CommandItem
                key={source.id}
                value={source.id}
                data-checked={isChecked(source.id)}
                // Why: an empty selection would blank the calendar, so the last checked source stays.
                disabled={isChecked(source.id) && checkedCount <= 1}
                onSelect={() =>
                  props.onChange(toggleSourceSelection(selected, sourceIds, source.id))
                }
              >
                <Check
                  className={cn(
                    'size-3.5 text-muted-foreground',
                    !isChecked(source.id) && 'opacity-0'
                  )}
                />
                <span className="truncate">{source.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
