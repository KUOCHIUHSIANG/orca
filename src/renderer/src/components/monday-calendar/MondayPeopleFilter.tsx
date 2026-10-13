import { useMemo, useState } from 'react'
import { Check, ChevronRight, ChevronsUpDown, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MondayPerson } from '../../../../shared/monday-calendar-types'

function triggerLabel(people: readonly MondayPerson[], selected: readonly string[] | null): string {
  if (!selected) {
    return translate('auto.components.mondayCalendar.people.everyone', 'Everyone')
  }
  const names = people.filter((person) => selected.includes(person.id)).map((person) => person.name)
  if (names.length <= 1) {
    return names[0] ?? translate('auto.components.mondayCalendar.people.everyone', 'Everyone')
  }
  return `${names[0]} +${names.length - 1}`
}

export function MondayPeopleFilter(props: {
  people: readonly MondayPerson[]
  selectedPersonIds: readonly string[] | null
  onChange: (next: string[] | null) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [othersExpanded, setOthersExpanded] = useState(false)
  const selected = props.selectedPersonIds
  const needle = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      needle
        ? props.people.filter((person) => person.name.toLowerCase().includes(needle))
        : props.people,
    [needle, props.people]
  )
  const chosen = selected ? props.people.filter((person) => selected.includes(person.id)) : []
  const others = selected
    ? props.people.filter((person) => !selected.includes(person.id))
    : props.people

  const toggle = (personId: string): void => {
    if (!selected) {
      props.onChange([personId])
      return
    }
    const next = selected.includes(personId)
      ? selected.filter((id) => id !== personId)
      : [...selected, personId]
    // Why: an empty selection would hide everything; treat it as "everyone" instead.
    props.onChange(next.length > 0 ? next : null)
  }

  const renderPerson = (person: MondayPerson): React.JSX.Element => (
    <CommandItem key={person.id} value={person.id} onSelect={() => toggle(person.id)}>
      <Check
        className={cn(
          'size-3.5 text-muted-foreground',
          !selected?.includes(person.id) && 'opacity-0'
        )}
      />
      <span className="truncate">{person.name}</span>
    </CommandItem>
  )

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        setQuery('')
        // Why: with someone picked, everyone else stays folded away until asked for.
        setOthersExpanded(false)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={translate('auto.components.mondayCalendar.people.label', 'People')}
          className="max-w-48"
        >
          <Users className="size-3.5 text-muted-foreground" />
          <span className="truncate">{triggerLabel(props.people, selected)}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            placeholder={translate(
              'auto.components.mondayCalendar.people.search',
              'Search people...'
            )}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {translate('auto.components.mondayCalendar.people.empty', 'No matching people.')}
            </CommandEmpty>
            {needle ? (
              matches.map(renderPerson)
            ) : (
              <>
                <CommandItem value="__everyone__" onSelect={() => props.onChange(null)}>
                  <Check
                    className={cn('size-3.5 text-muted-foreground', selected && 'opacity-0')}
                  />
                  {translate('auto.components.mondayCalendar.people.everyone', 'Everyone')}
                </CommandItem>
                {chosen.map(renderPerson)}
                {selected && others.length > 0 ? (
                  <CommandItem
                    value="__others__"
                    aria-expanded={othersExpanded}
                    onSelect={() => setOthersExpanded((current) => !current)}
                  >
                    <ChevronRight
                      className={cn(
                        'size-3.5 text-muted-foreground transition-transform',
                        othersExpanded && 'rotate-90'
                      )}
                    />
                    <span className="text-muted-foreground">
                      {translate('auto.components.mondayCalendar.people.others', 'Other people')}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {others.length}
                    </span>
                  </CommandItem>
                ) : null}
                {!selected || othersExpanded ? others.map(renderPerson) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
