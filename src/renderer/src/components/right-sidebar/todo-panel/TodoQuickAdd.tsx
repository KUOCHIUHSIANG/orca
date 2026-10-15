import { useRef, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { isMac } from '@/app-shell/app-window-chrome'
import { translate } from '@/i18n/i18n'
import { TodoDueDatePicker } from './TodoDueDatePicker'
import type { TodoDraft } from './use-microsoft-todo'

/** Title first; typing reveals a note and due date. Enter submits and keeps focus for the next task. */
export function TodoQuickAdd(props: {
  disabled: boolean
  today: string
  onCreate: (draft: TodoDraft) => Promise<boolean>
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const expanded = title.trim() !== '' || notes !== '' || dueDate !== null

  const submit = (): void => {
    const trimmed = title.trim()
    if (!trimmed || saving) {
      return
    }
    setSaving(true)
    void props.onCreate({ title: trimmed, dueDate, notes: notes.trim() }).then((created) => {
      setSaving(false)
      if (created) {
        setTitle('')
        setNotes('')
        setDueDate(null)
        titleRef.current?.focus()
      }
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {/* Why readOnly, not disabled, while saving: disabling drops focus mid-entry. */}
      <Input
        ref={titleRef}
        value={title}
        disabled={props.disabled}
        readOnly={saving}
        maxLength={255}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={translate(
          'auto.components.todoPanel.add.placeholder',
          'Add a task, press Enter'
        )}
        aria-label={translate('auto.components.todoPanel.add.label', 'New task')}
        className="h-8"
      />
      <Collapsible open={expanded}>
        <CollapsibleContent animation="height">
          {/* Why: padding keeps focus rings inside the clipped animation box. */}
          <div className="space-y-1.5 px-px pt-1.5 pb-px">
            <Textarea
              value={notes}
              rows={2}
              readOnly={saving}
              maxLength={20_000}
              placeholder={translate(
                'auto.components.todoPanel.add.notesPlaceholder',
                'Note (optional)'
              )}
              aria-label={translate('auto.components.todoPanel.details.notes', 'Notes')}
              onChange={(event) => setNotes(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (isMac ? event.metaKey : event.ctrlKey)) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <TodoDueDatePicker
                value={dueDate}
                today={props.today}
                disabled={saving}
                onChange={setDueDate}
              />
              <Button type="submit" size="xs" disabled={!title.trim() || saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                {translate('auto.components.todoPanel.add.submit', 'Add')}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </form>
  )
}
