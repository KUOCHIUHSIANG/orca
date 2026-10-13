import type { MicrosoftTodoChecklistItem } from '../../shared/microsoft-todo-types'
import { asString, isRecord } from '../untrusted-json-guards'
import { MicrosoftTodoError } from './microsoft-todo-auth'
import { collectPages, taskPath, type GraphRunner } from './microsoft-graph-todo'

function mapChecklistItem(raw: unknown): MicrosoftTodoChecklistItem | null {
  const id = isRecord(raw) ? asString(raw.id) : null
  if (!isRecord(raw) || !id) {
    return null
  }
  return { id, title: asString(raw.displayName) ?? '', checked: raw.isChecked === true }
}

export async function fetchTodoChecklist(
  run: GraphRunner,
  args: { listId: string; taskId: string }
): Promise<MicrosoftTodoChecklistItem[]> {
  const rows = await collectPages(run, `${taskPath(args.listId, args.taskId)}/checklistItems`)
  return rows
    .map(mapChecklistItem)
    .filter((item): item is MicrosoftTodoChecklistItem => item !== null)
}

export async function setTodoChecklistItemChecked(
  run: GraphRunner,
  args: { listId: string; taskId: string; itemId: string; checked: boolean }
): Promise<MicrosoftTodoChecklistItem> {
  const item = mapChecklistItem(
    await run(
      'PATCH',
      `${taskPath(args.listId, args.taskId)}/checklistItems/${encodeURIComponent(args.itemId)}`,
      { isChecked: args.checked }
    )
  )
  if (!item) {
    throw new MicrosoftTodoError('api', 'Microsoft did not return the updated step.')
  }
  return item
}

export async function deleteTodoChecklistItem(
  run: GraphRunner,
  args: { listId: string; taskId: string; itemId: string }
): Promise<void> {
  await run(
    'DELETE',
    `${taskPath(args.listId, args.taskId)}/checklistItems/${encodeURIComponent(args.itemId)}`
  )
}
