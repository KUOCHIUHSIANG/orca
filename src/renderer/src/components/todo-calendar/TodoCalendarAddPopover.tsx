import { useState } from 'react'
import { Plus } from 'lucide-react'
import { parseIsoDate } from '@/components/calendar/calendar-dates'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { MicrosoftTodoList } from '../../../../shared/microsoft-todo-types'
import { TodoQuickAdd } from '../right-sidebar/todo-panel/TodoQuickAdd'
import type { TodoDraft } from '../right-sidebar/todo-panel/use-microsoft-todo'

/** The "+" on a calendar day: the sidebar's add form with that day preset and a list choice. */
export function TodoCalendarAddPopover(props: {
  day: string
  today: string
  lists: readonly MicrosoftTodoList[]
  defaultListId: string
  onCreate: (draft: TodoDraft, listId: string) => Promise<boolean>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [listId, setListId] = useState(props.defaultListId)
  const dayLabel = new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  }).format(parseIsoDate(props.day))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={translate('auto.components.todoCalendar.addOn', 'Add a task on {{value0}}', {
            value0: dayLabel
          })}
        >
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="p-2">
          <TodoQuickAdd
            disabled={false}
            today={props.today}
            defaultDueDate={props.day}
            autoFocus
            onCreate={async (draft) => {
              const created = await props.onCreate(draft, listId)
              if (created) {
                setOpen(false)
              }
              return created
            }}
            extraControls={
              props.lists.length > 1 ? (
                <Select value={listId} onValueChange={setListId}>
                  <SelectTrigger
                    size="sm"
                    className="max-w-28"
                    aria-label={translate('auto.components.todoPanel.list', 'List')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {props.lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
