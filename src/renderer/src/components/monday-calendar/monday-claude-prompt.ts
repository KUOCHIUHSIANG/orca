import { translate } from '@/i18n/i18n'
import type {
  MondayCalendarItem,
  MondayUpdateEntry
} from '../../../../shared/monday-calendar-types'
import { formatMondayEntryTime } from './monday-date-range-format'

export type MondayClaudeAction = 'implement' | 'reply'

/** The comment a prompt is about; a reply also names the update it sits under. */
export type MondayPromptFocus = { entry: MondayUpdateEntry; parentUpdateId: string | null }

function actionLine(action: MondayClaudeAction, hasFocus: boolean): string {
  if (action === 'implement') {
    return hasFocus
      ? translate(
          'auto.components.mondayCalendar.claudePrompt.implementComment',
          'Implement or fix what the monday comment below asks for.'
        )
      : translate(
          'auto.components.mondayCalendar.claudePrompt.implementTask',
          'Implement or fix this monday task according to its content.'
        )
  }
  return hasFocus
    ? translate(
        'auto.components.mondayCalendar.claudePrompt.replyComment',
        'Help me understand what the monday comment below is saying, and tell me how I should reply.'
      )
    : translate(
        'auto.components.mondayCalendar.claudePrompt.replyTask',
        'Help me understand this monday task, and tell me how I should reply.'
      )
}

function focusLine({ entry, parentUpdateId }: MondayPromptFocus): string {
  const author = entry.authorName ?? '—'
  const header = entry.createdAt ? `${author} · ${formatMondayEntryTime(entry.createdAt)}` : author
  return parentUpdateId
    ? translate(
        'auto.components.mondayCalendar.claudePrompt.replyFocus',
        'Comment: {{value0}} (a reply under update id {{value2}}, reply id {{value1}})',
        { value0: header, value1: entry.id, value2: parentUpdateId }
      )
    : translate(
        'auto.components.mondayCalendar.claudePrompt.updateFocus',
        'Comment: {{value0}} (update id {{value1}})',
        { value0: header, value1: entry.id }
      )
}

/** Link-only so the draft stays short; Claude reads the live discussion through its monday tools. */
export function buildMondayClaudePrompt(args: {
  item: MondayCalendarItem
  action: MondayClaudeAction
  focus?: MondayPromptFocus
}): string {
  const lines = [
    actionLine(args.action, args.focus !== undefined),
    translate(
      'auto.components.mondayCalendar.claudePrompt.instructions',
      'First use the monday tools to read all of the task’s updates and replies (opening the link directly only lands on the login page). To look at an image, get a fresh link from the monday tools (image links expire after an hour), download it into the system temp folder, and delete the file right after viewing it.'
    ),
    '',
    translate('auto.components.mondayCalendar.claudePrompt.task', 'Task: {{value0}}', {
      value0: args.item.name
    }),
    args.item.url
  ]
  if (args.focus) {
    lines.push(focusLine(args.focus))
  }
  return lines.join('\n')
}
