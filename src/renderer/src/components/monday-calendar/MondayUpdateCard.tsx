import { Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import type { MondayUpdate, MondayUpdateEntry } from '../../../../shared/monday-calendar-types'
import { formatMondayEntryTime } from './monday-date-range-format'
import { MondayClaudePromptPicker } from './MondayClaudePromptPicker'
import { MondayRichText } from './MondayRichText'

function AuthorAvatar(props: { name: string | null }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground"
    >
      {props.name?.trim().charAt(0).toUpperCase() ?? '?'}
    </span>
  )
}

function EntryBody(props: {
  entry: MondayUpdateEntry
  action?: React.ReactNode
}): React.JSX.Element {
  const { entry } = props
  const exactTime = entry.createdAt ? formatMondayEntryTime(entry.createdAt) : undefined
  return (
    <div className="flex min-w-0 gap-2.5">
      <AuthorAvatar name={entry.authorName} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="truncate font-medium text-foreground">{entry.authorName ?? '—'}</span>
          {entry.createdAt ? (
            <time
              dateTime={entry.createdAt}
              title={exactTime}
              className="shrink-0 text-muted-foreground"
            >
              {formatUiRelativeTimeFromDate(entry.createdAt, exactTime)}
            </time>
          ) : null}
          {props.action ? <div className="ml-auto -my-1 shrink-0">{props.action}</div> : null}
        </div>
        <MondayRichText html={entry.bodyHtml} />
        {entry.attachments.length > 0 ? (
          <ul className="space-y-1">
            {entry.attachments.map((attachment) => (
              <li key={attachment.id}>
                <button
                  type="button"
                  onClick={() => void window.api.shell.openUrl(attachment.url)}
                  className="inline-flex max-w-full items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
                >
                  <Paperclip className="size-3.5 shrink-0" />
                  <span className="truncate">{attachment.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

export function MondayUpdateCard(props: {
  update: MondayUpdate
  buildPrompt: (includeAllUpdates: boolean) => string
}): React.JSX.Element {
  const askLabel = translate(
    'auto.components.mondayCalendar.claude.askUpdate',
    'Ask Claude how to reply to this update'
  )
  return (
    <article className="overflow-hidden rounded-md border border-border bg-card text-card-foreground">
      <div className="p-3">
        <EntryBody
          entry={props.update}
          action={
            <MondayClaudePromptPicker buildPrompt={props.buildPrompt} tooltip={askLabel}>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={askLabel}>
                <AgentIcon agent="claude" size={12} />
              </Button>
            </MondayClaudePromptPicker>
          }
        />
      </div>
      {props.update.replies.length > 0 ? (
        <div className="space-y-3 border-t border-border bg-muted/30 p-3">
          {props.update.replies.map((reply) => (
            <EntryBody key={reply.id} entry={reply} />
          ))}
        </div>
      ) : null}
    </article>
  )
}
