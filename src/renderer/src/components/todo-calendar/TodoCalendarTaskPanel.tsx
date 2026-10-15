import { useEffect, useRef } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { CalendarIconAction } from '@/components/calendar/CalendarIconAction'
import { translate } from '@/i18n/i18n'
import type { MicrosoftTodoTask } from '../../../../shared/microsoft-todo-types'
import { TodoTaskDetails } from '../right-sidebar/todo-panel/TodoTaskDetails'
import type { TodoTaskChanges } from '../right-sidebar/todo-panel/todo-task-edits'
import { useTodoTaskDraft } from '../right-sidebar/todo-panel/use-todo-task-draft'

/** Side panel editing the selected task with the sidebar's form; a successful save closes it. */
export function TodoCalendarTaskPanel(props: {
  task: MicrosoftTodoTask
  listName: string | null
  today: string
  onUpdate: (changes: TodoTaskChanges) => Promise<boolean>
  onDelete: () => void
  onClose: () => void
}): React.JSX.Element {
  const draft = useTodoTaskDraft(props.task, props.onUpdate)
  // Why: closing, Escape and picking another task all unmount the panel; like collapsing a
  // sidebar row, that must not drop edits the user forgot to save.
  const saveRef = useRef(draft.save)
  const skipSaveOnCloseRef = useRef(false)
  useEffect(() => {
    saveRef.current = draft.save
  })
  useEffect(
    () => () => {
      if (!skipSaveOnCloseRef.current) {
        void saveRef.current()
      }
    },
    []
  )
  return (
    <aside
      aria-label={props.task.title}
      className="flex w-[380px] max-w-[45%] shrink-0 flex-col border-l border-border"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border py-1.5 pr-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {props.listName}
        </span>
        <CalendarIconAction
          label={translate('auto.components.todoPanel.row.openWeb', 'Open in To Do on the web')}
          onClick={() => void window.api.shell.openUrl(props.task.webUrl)}
        >
          <ExternalLink />
        </CalendarIconAction>
        <CalendarIconAction
          label={translate('auto.components.todoCalendar.closeDetails', 'Close details')}
          disabled={draft.saving}
          onClick={props.onClose}
        >
          <X />
        </CalendarIconAction>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <TodoTaskDetails
          task={props.task}
          today={props.today}
          edits={draft.edits}
          dirty={draft.dirty}
          saving={draft.saving}
          onEdit={draft.editDraft}
          onSave={() =>
            draft.saveThen(() => {
              skipSaveOnCloseRef.current = true
              props.onClose()
            })
          }
          onDelete={() => {
            skipSaveOnCloseRef.current = true
            draft.discard()
            props.onDelete()
          }}
        />
      </div>
    </aside>
  )
}
