import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'

/** Title plus optional due date; Enter submits and keeps focus for the next task. */
export function TodoQuickAdd(props: {
  disabled: boolean
  onCreate: (title: string, dueDate: string | null) => Promise<boolean>
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = title.trim()
        if (!trimmed || saving) {
          return
        }
        setSaving(true)
        void props.onCreate(trimmed, dueDate || null).then((created) => {
          setSaving(false)
          if (created) {
            setTitle('')
            setDueDate('')
          }
        })
      }}
    >
      <Input
        value={title}
        disabled={props.disabled || saving}
        maxLength={255}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={translate(
          'auto.components.todoPanel.add.placeholder',
          'Add a task, press Enter'
        )}
        aria-label={translate('auto.components.todoPanel.add.label', 'New task')}
        className="h-8 min-w-0 flex-1"
      />
      <Input
        type="date"
        value={dueDate}
        disabled={props.disabled || saving}
        onChange={(event) => setDueDate(event.target.value)}
        aria-label={translate('auto.components.todoPanel.add.dueDate', 'Due date')}
        className="h-8 w-[8.5rem] shrink-0"
      />
    </form>
  )
}
