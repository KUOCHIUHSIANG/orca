import { useCallback, useState } from 'react'
import type { MicrosoftTodoTask } from '../../../../../shared/microsoft-todo-types'
import { hasTodoChanges, pendingTodoChanges, type TodoTaskChanges } from './todo-task-edits'

/** A task editor's unsaved edits; they clear only once Microsoft accepts them, so failures can be retried. */
export function useTodoTaskDraft(
  task: MicrosoftTodoTask,
  onUpdate: (changes: TodoTaskChanges) => Promise<boolean>
): {
  edits: TodoTaskChanges
  dirty: boolean
  saving: boolean
  editDraft: (next: TodoTaskChanges) => void
  discard: () => void
  /** Sends the draft in the background (collapse, tick); resolves true when nothing is left unsaved. */
  save: () => Promise<boolean>
  /** Save button: spins until Microsoft answers, then runs `onSaved` on success. */
  saveThen: (onSaved: () => void) => void
} {
  const [edits, setEdits] = useState<TodoTaskChanges>({})
  const [saving, setSaving] = useState(false)
  const changes = pendingTodoChanges(task, edits)
  const dirty = hasTodoChanges(changes)

  const editDraft = useCallback(
    (next: TodoTaskChanges) => setEdits((current) => ({ ...current, ...next })),
    []
  )
  const discard = useCallback(() => setEdits({}), [])

  const save = async (): Promise<boolean> => {
    if (!dirty) {
      return true
    }
    const sent = edits
    const saved = await onUpdate(changes)
    if (saved) {
      // Why: keep anything typed while the request was out; it already diffs against the saved task.
      setEdits((current) => (current === sent ? {} : current))
    }
    return saved
  }

  const saveThen = (onSaved: () => void): void => {
    setSaving(true)
    void save().then((saved) => {
      setSaving(false)
      if (saved) {
        onSaved()
      }
    })
  }

  return { edits, dirty, saving, editDraft, discard, save, saveThen }
}
