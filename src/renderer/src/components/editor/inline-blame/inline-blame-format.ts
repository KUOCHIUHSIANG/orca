import { translate } from '@/i18n/i18n'
import { getUiRelativeTimeFormatter } from '@/i18n/relative-time-format'
import { GIT_BLAME_UNCOMMITTED_SHA, type GitBlameCommit } from '../../../../../shared/git-blame'

const annotationDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

const DAY_MS = 86_400_000

export function isUncommittedBlame(commit: Pick<GitBlameCommit, 'sha'>): boolean {
  return commit.sha === GIT_BLAME_UNCOMMITTED_SHA
}

export function formatBlameDateTime(timestamp: number): string {
  return Number.isFinite(timestamp) && timestamp > 0
    ? annotationDateFormatter.format(new Date(timestamp))
    : ''
}

/** `Jater | 2026/4/7 17:30 | summary`; uncommitted lines read as the user's own pending edit. */
export function formatInlineBlameText(commit: GitBlameCommit): string {
  if (isUncommittedBlame(commit)) {
    return [
      translate('dashboardPopout.card.you', 'You'),
      translate('auto.components.editor.EditorViewToggle.167f45888c', 'Uncommitted changes')
    ].join(' | ')
  }
  return [commit.author, formatBlameDateTime(commit.authorTime), commit.summary]
    .filter(Boolean)
    .join(' | ')
}

/** Relative age in the UI language, continuing past days to months and years ("13 months ago"). */
export function formatBlameRelativeTime(timestamp: number, now = Date.now()): string {
  const formatter = getUiRelativeTimeFormatter()
  const diffMs = timestamp - now
  const diffMinutes = Math.round(diffMs / 60_000)
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute')
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour')
  }
  const diffDays = Math.round(diffMs / DAY_MS)
  if (Math.abs(diffDays) < 30) {
    return formatter.format(diffDays, 'day')
  }
  const diffMonths = Math.round(diffMs / (DAY_MS * 30.44))
  // Why 18: "13 months ago" says more than "last year", matching GitLens.
  if (Math.abs(diffMonths) < 18) {
    return formatter.format(diffMonths, 'month')
  }
  return formatter.format(Math.round(diffMs / (DAY_MS * 365.25)), 'year')
}
