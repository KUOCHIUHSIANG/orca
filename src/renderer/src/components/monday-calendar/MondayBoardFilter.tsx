import { useState } from 'react'
import { Check, ChevronsUpDown, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MondayBoardSummary } from '../../../../shared/monday-calendar-types'
import { toggleMondayBoardSelection } from './monday-calendar-filter'

function triggerLabel(
  boards: readonly MondayBoardSummary[],
  selected: readonly string[] | null
): string {
  const names = selected
    ? boards.filter((board) => selected.includes(board.id)).map((board) => board.name)
    : []
  if (names.length === 0) {
    return translate('auto.components.mondayCalendar.boards.all', 'All boards')
  }
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`
}

export function MondayBoardFilter(props: {
  boards: readonly MondayBoardSummary[]
  selectedBoardIds: readonly string[] | null
  onChange: (next: string[] | null) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const selected = props.selectedBoardIds
  const boardIds = props.boards.map((board) => board.id)
  const isChecked = (boardId: string): boolean => !selected || selected.includes(boardId)
  const checkedCount = selected ? selected.length : boardIds.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={translate('auto.components.mondayCalendar.boards.label', 'Boards')}
          className="max-w-56"
        >
          <LayoutGrid className="size-3.5 text-muted-foreground" />
          <span className="truncate">{triggerLabel(props.boards, selected)}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <Command>
          <CommandList>
            <CommandItem value="__all_boards__" onSelect={() => props.onChange(null)}>
              <Check className={cn('size-3.5 text-muted-foreground', selected && 'opacity-0')} />
              {translate('auto.components.mondayCalendar.boards.all', 'All boards')}
            </CommandItem>
            {props.boards.map((board) => (
              <CommandItem
                key={board.id}
                value={board.id}
                data-checked={isChecked(board.id)}
                // Why: an empty selection would blank the calendar, so the last checked board stays.
                disabled={isChecked(board.id) && checkedCount <= 1}
                onSelect={() =>
                  props.onChange(toggleMondayBoardSelection(selected, boardIds, board.id))
                }
              >
                <Check
                  className={cn(
                    'size-3.5 text-muted-foreground',
                    !isChecked(board.id) && 'opacity-0'
                  )}
                />
                <span className="truncate">{board.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
