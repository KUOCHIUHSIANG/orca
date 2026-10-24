import { translate } from '@/i18n/i18n'
import type {
  MondayCalendarItem,
  MondayUpdate,
  MondayUpdateEntry
} from '../../../../shared/monday-calendar-types'
import { formatMondayDateRange, formatMondayEntryTime } from './monday-date-range-format'

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'TR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6'
])
const EXTERNAL_URL = /^https?:\/\//i

function appendNodeText(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push((node.textContent ?? '').replace(/\s+/g, ' '))
    return
  }
  if (!(node instanceof Element)) {
    return
  }
  const tag = node.tagName
  if (tag === 'BR') {
    out.push('\n')
    return
  }
  if (tag === 'IMG') {
    const src = node.getAttribute('src') ?? ''
    const label = translate('auto.components.mondayCalendar.claudePrompt.image', 'Image')
    out.push(EXTERNAL_URL.test(src) ? `[${label}: ${src}]` : `[${label}]`)
    return
  }
  const isBlock = BLOCK_TAGS.has(tag)
  if (isBlock) {
    out.push('\n')
  }
  if (tag === 'LI') {
    const list = node.parentElement
    const position = list ? Array.from(list.children).indexOf(node) + 1 : 1
    out.push(list?.tagName === 'OL' ? `${position}. ` : '- ')
  }
  for (const child of Array.from(node.childNodes)) {
    appendNodeText(child, out)
  }
  const href = tag === 'A' ? (node.getAttribute('href') ?? '') : ''
  // Why: mention links point at monday profiles; the @name alone is what matters.
  if (EXTERNAL_URL.test(href) && href !== node.textContent?.trim() && !/\/users\//.test(href)) {
    out.push(` (${href})`)
  }
  // Why: list items break before themselves only, so consecutive items stay on adjacent lines.
  if (isBlock && tag !== 'LI') {
    out.push('\n')
  }
}

/** Plain text of a monday update body, keeping line breaks, list markers, and link targets. */
export function mondayHtmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: string[] = []
  appendNodeText(doc.body, out)
  return out
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function entryHeader(entry: MondayUpdateEntry): string {
  const author = entry.authorName ?? '—'
  return entry.createdAt ? `${author} · ${formatMondayEntryTime(entry.createdAt)}` : author
}

function entryText(entry: MondayUpdateEntry): string {
  const lines = [mondayHtmlToPlainText(entry.bodyHtml)]
  if (entry.attachments.length > 0) {
    lines.push(
      `${translate('auto.components.mondayCalendar.claudePrompt.attachments', 'Attachments')}:`,
      ...entry.attachments.map((attachment) => `- ${attachment.name} (${attachment.url})`)
    )
  }
  return lines.filter(Boolean).join('\n')
}

function formatEntry(entry: MondayUpdateEntry): string {
  return `### ${entryHeader(entry)}\n\n${entryText(entry)}`
}

function formatUpdate(update: MondayUpdate): string {
  const replyLabel = translate('auto.components.mondayCalendar.claudePrompt.reply', 'Reply')
  const parts = [formatEntry(update)]
  for (const reply of update.replies) {
    parts.push(`#### ↳ ${replyLabel} · ${entryHeader(reply)}`, entryText(reply))
  }
  return parts.join('\n\n')
}

function formatTaskFacts(item: MondayCalendarItem, ownerNames: readonly string[]): string {
  const facts: [string, string][] = [
    [translate('auto.components.mondayCalendar.claudePrompt.name', 'Name'), item.name]
  ]
  if (item.parentItemName) {
    facts.push([
      translate('auto.components.mondayCalendar.claudePrompt.parent', 'Parent item'),
      item.parentItemName
    ])
  }
  facts.push(
    [
      translate('auto.components.mondayCalendar.item.board', 'Board'),
      item.groupTitle ? `${item.boardName} · ${item.groupTitle}` : item.boardName
    ],
    [translate('auto.components.mondayCalendar.item.status', 'Status'), item.statusLabel ?? '—'],
    [
      translate('auto.components.mondayCalendar.item.owners', 'Owners'),
      ownerNames.length > 0 ? ownerNames.join(', ') : '—'
    ],
    [
      translate('auto.components.mondayCalendar.item.dates', 'Dates'),
      formatMondayDateRange(item) ??
        translate('auto.components.mondayCalendar.undated.title', 'No date')
    ],
    [translate('auto.components.mondayCalendar.claudePrompt.link', 'Link'), item.url]
  )
  return facts.map(([label, value]) => `- ${label}: ${value}`).join('\n')
}

function oldestFirst(updates: readonly MondayUpdate[]): MondayUpdate[] {
  return [...updates].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
}

/**
 * The prompt asking Claude to explain a monday task (or one of its updates) and draft a reply.
 * The oldest update is the task's description, so it always rides along as context.
 */
export function buildMondayClaudePrompt(args: {
  item: MondayCalendarItem
  ownerNames: readonly string[]
  updates: readonly MondayUpdate[]
  /** Focus the prompt on this update; the task stays as context. */
  focusUpdateId?: string
  includeAllUpdates: boolean
}): string {
  const ordered = oldestFirst(args.updates)
  const focus = ordered.find((update) => update.id === args.focusUpdateId) ?? null
  const description = ordered[0] ?? null
  const sections = [
    translate(
      'auto.components.mondayCalendar.claudePrompt.ask',
      'Help me understand the content of the monday task below, and tell me how I should reply.'
    )
  ]
  if (focus) {
    sections.push(
      `## ${translate('auto.components.mondayCalendar.claudePrompt.focusHeading', 'Update to reply to')}`,
      formatUpdate(focus)
    )
  }
  sections.push(
    `## ${translate('auto.components.mondayCalendar.claudePrompt.taskHeading', 'Task')}`,
    formatTaskFacts(args.item, args.ownerNames)
  )
  const others = ordered.filter((update) => update !== focus)
  if (args.includeAllUpdates && others.length > 0) {
    sections.push(
      `## ${
        focus
          ? translate(
              'auto.components.mondayCalendar.claudePrompt.otherUpdatesHeading',
              'Other updates (oldest first)'
            )
          : translate(
              'auto.components.mondayCalendar.claudePrompt.updatesHeading',
              'Updates (oldest first)'
            )
      }`,
      ...others.map(formatUpdate)
    )
  } else if (description && description !== focus) {
    sections.push(
      `## ${translate(
        'auto.components.mondayCalendar.claudePrompt.descriptionHeading',
        'Task description (first update)'
      )}`,
      formatEntry(description)
    )
  }
  return sections.join('\n\n')
}
