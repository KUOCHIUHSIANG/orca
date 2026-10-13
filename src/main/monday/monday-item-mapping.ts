import type { MondayCalendarItem, MondayPerson } from '../../shared/monday-calendar-types'
import { asString, isRecord } from '../untrusted-json-guards'

const STATUS_TITLE_PATTERN = /status|狀態|状态/i
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/

type ColumnValue = Record<string, unknown>

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** monday stores a date with a time in UTC, but a bare date is already a calendar day. */
export function toLocalCalendarDate(date: string, time: string | null): string | null {
  if (!ISO_DATE_PATTERN.test(date)) {
    return null
  }
  if (!time) {
    return date.slice(0, 10)
  }
  const instant = new Date(`${date.slice(0, 10)}T${time}Z`)
  if (Number.isNaN(instant.getTime())) {
    return date.slice(0, 10)
  }
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`
}

function columnTitle(value: ColumnValue): string {
  return isRecord(value.column) ? (asString(value.column.title) ?? '') : ''
}

function readOwnerIds(values: ColumnValue[]): string[] {
  const ids: string[] = []
  for (const value of values) {
    if (value.type !== 'people' || !Array.isArray(value.persons_and_teams)) {
      continue
    }
    for (const entry of value.persons_and_teams) {
      const id = isRecord(entry) && entry.kind === 'person' ? asString(entry.id) : null
      if (id && !ids.includes(id)) {
        ids.push(id)
      }
    }
  }
  return ids
}

/** Timeline wins; otherwise every filled date column spans earliest → latest. */
export function readDateRange(values: ColumnValue[]): { start: string; end: string } | null {
  for (const value of values) {
    const from = value.type === 'timeline' ? asString(value.from) : null
    const to = value.type === 'timeline' ? asString(value.to) : null
    if (from && to && ISO_DATE_PATTERN.test(from) && ISO_DATE_PATTERN.test(to)) {
      const [start, end] = [from.slice(0, 10), to.slice(0, 10)].sort()
      return { start, end }
    }
  }
  const dates = values
    .filter((value) => value.type === 'date')
    .map((value) => {
      const date = asString(value.date)
      return date ? toLocalCalendarDate(date, asString(value.time)) : null
    })
    .filter((date): date is string => date !== null)
    .sort()
  return dates.length > 0 ? { start: dates[0], end: dates.at(-1) ?? dates[0] } : null
}

function readStatus(values: ColumnValue[]): {
  label: string | null
  color: string | null
  isDone: boolean
} {
  const statuses = values.filter((value) => value.type === 'status')
  // Why: boards often carry a second status-typed column (Priority); prefer the one titled Status.
  const status =
    statuses.find((value) => STATUS_TITLE_PATTERN.test(columnTitle(value))) ?? statuses[0]
  if (!status) {
    return { label: null, color: null, isDone: false }
  }
  const label = asString(status.label) ?? asString(status.text)
  const color = isRecord(status.label_style) ? asString(status.label_style.color) : null
  return {
    label,
    color: label ? color : null,
    isDone: status.is_done === true || label?.trim().toLowerCase() === 'done'
  }
}

/** A subitem's own group is the generic "Subitems" bucket, so it inherits its parent's group. */
function readGroupId(raw: Record<string, unknown>): string | null {
  const group = isRecord(raw.parent_item) ? raw.parent_item.group : raw.group
  return isRecord(group) ? asString(group.id) : null
}

export function mapMondayItem(
  raw: unknown,
  board: { id: string; name: string }
): MondayCalendarItem | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = asString(raw.id)
  const name = asString(raw.name)
  const url = asString(raw.url)
  const values = Array.isArray(raw.column_values) ? raw.column_values.filter(isRecord) : []
  const range = readDateRange(values)
  if (!id || !name || !url) {
    return null
  }
  const status = readStatus(values)
  return {
    id,
    name,
    url,
    boardId: board.id,
    boardName: board.name,
    groupId: readGroupId(raw),
    // Why: a subitem board's only group is a generic "Subitems" bucket; the parent name says more.
    groupTitle:
      !isRecord(raw.parent_item) && isRecord(raw.group) ? asString(raw.group.title) : null,
    parentItemName: isRecord(raw.parent_item) ? asString(raw.parent_item.name) : null,
    ownerIds: readOwnerIds(values),
    startDate: range?.start ?? null,
    endDate: range?.end ?? null,
    statusLabel: status.label,
    statusColor: status.color,
    isDone: status.isDone
  }
}

/** Subitems live on their own board, referenced from the parent board's subtasks column settings. */
export function readSubitemBoardIds(columns: unknown): string[] {
  const ids: string[] = []
  for (const column of Array.isArray(columns) ? columns : []) {
    const settings = isRecord(column) ? asString(column.settings_str) : null
    if (!settings) {
      continue
    }
    try {
      const parsed: unknown = JSON.parse(settings)
      const boardIds = isRecord(parsed) && Array.isArray(parsed.boardIds) ? parsed.boardIds : []
      for (const boardId of boardIds) {
        const value = typeof boardId === 'number' ? String(boardId) : asString(boardId)
        if (value && !ids.includes(value)) {
          ids.push(value)
        }
      }
    } catch {
      // Unparseable settings just mean no subitem board.
    }
  }
  return ids
}

export function mapMondayPeople(users: unknown): MondayPerson[] {
  const people: MondayPerson[] = []
  for (const user of Array.isArray(users) ? users : []) {
    const id = isRecord(user) ? asString(user.id) : null
    const name = isRecord(user) ? asString(user.name) : null
    if (id && name) {
      people.push({ id, name })
    }
  }
  return people
}
