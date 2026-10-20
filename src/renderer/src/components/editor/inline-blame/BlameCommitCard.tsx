import {
  Copy,
  Crosshair,
  FileDiff,
  GitCommitHorizontal,
  Globe,
  History,
  Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { GitBlameCommit } from '../../../../../shared/git-blame'
import { GitHubUserAvatar } from '../../github/github-user-avatar'
import { githubNoreplyLogin } from './blame-author-avatar'
import {
  copyBlameCommitHash,
  openBlameCommitDiff,
  openBlameCommitRemote,
  revealBlameCommitInGitLog
} from './blame-commit-actions'
import type { BlameHunk } from './blame-line-hunk'
import { formatBlameDateTime, formatBlameRelativeTime } from './inline-blame-format'
import type { InlineBlameFile } from './inline-blame-file'
import { useBlameCommitDetails } from './use-blame-commit-details'

function CardAction({
  label,
  icon: Icon,
  disabled,
  onClick
}: {
  label: string
  icon: typeof Copy
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function BlameHunkPreview({ hunk }: { hunk: BlameHunk }): React.JSX.Element {
  return (
    <div className="scrollbar-sleek overflow-x-auto rounded-md border border-border bg-editor-surface font-mono text-[11px] leading-4">
      <div className="w-max min-w-full py-1">
        {hunk.lines.map((line) => (
          <div
            key={line.key}
            className={cn(
              'flex',
              line.kind === 'added' && 'bg-[var(--diff-added-ground)]',
              line.kind === 'removed' && 'bg-[var(--diff-removed-ground)]',
              // Why the stronger tint: picks the blamed line out of a multi-line change.
              line.current && 'bg-[var(--diff-added-gutter)]'
            )}
          >
            <span
              className={cn(
                'w-5 shrink-0 select-none text-center',
                line.kind === 'added'
                  ? 'bg-[var(--diff-added-gutter)] text-[var(--git-decoration-added)]'
                  : 'bg-[var(--diff-removed-gutter)] text-[var(--git-decoration-deleted)]'
              )}
              aria-hidden
            >
              {line.kind === 'added' ? '+' : '-'}
            </span>
            <span className="whitespace-pre pr-2 pl-1.5 text-foreground">{line.text}</span>
          </div>
        ))}
        {hunk.truncated && <div className="pl-6.5 text-muted-foreground">…</div>}
      </div>
    </div>
  )
}

/** Hover card body for a blamed line: author, age, full message, actions and the line's change. */
export function BlameCommitCard({
  file,
  commit,
  originalLine,
  onDone
}: {
  file: InlineBlameFile
  commit: GitBlameCommit
  originalLine: number
  /** Every action finishes the card's job, so the caller closes it. */
  onDone: () => void
}): React.JSX.Element {
  const details = useBlameCommitDetails(file, commit, originalLine)
  const run = (action: () => void) => (): void => {
    action()
    onDone()
  }
  const message = details.message ?? commit.summary
  const absoluteTime = formatBlameDateTime(commit.authorTime)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <GitHubUserAvatar
          login={githubNoreplyLogin(commit.authorEmail) ?? ''}
          name={commit.author}
          avatarUrl={details.avatarUrl}
          title={commit.authorEmail}
          className="size-8"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <span className="truncate text-sm font-medium text-foreground">{commit.author}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <History className="size-3" />
            {formatBlameRelativeTime(commit.authorTime)}
            {absoluteTime && <span>({absoluteTime})</span>}
          </span>
        </div>
      </div>
      <div className="scrollbar-sleek max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[13px] text-foreground">
        {message}
      </div>
      <div className="flex items-center gap-0.5 border-t border-border pt-2">
        <span className="mr-1 flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">
          <GitCommitHorizontal className="size-3.5" />
          {commit.sha.slice(0, 7)}
        </span>
        <CardAction
          label={translate(
            'auto.components.right.sidebar.GitHistoryCommitContextMenu.8c2d5fab13',
            'Copy commit hash'
          )}
          icon={Copy}
          onClick={run(() => void copyBlameCommitHash(commit.sha))}
        />
        {!file.submodulePath && (
          <CardAction
            label="Open changes"
            icon={FileDiff}
            onClick={run(() => openBlameCommitDiff(file, commit))}
          />
        )}
        {!file.isFolderWorkspace && !file.submodulePath && (
          <CardAction
            label="Show in Git log"
            icon={Crosshair}
            onClick={run(() => revealBlameCommitInGitLog(file, commit.sha))}
          />
        )}
        {!file.submodulePath && (
          <CardAction
            label={translate(
              'auto.components.right.sidebar.GitHistoryCommitContextMenu.7b1c4e9a02',
              'Open commit in browser'
            )}
            icon={Globe}
            disabled={!details.remoteUrl}
            onClick={run(() => {
              if (details.remoteUrl) {
                openBlameCommitRemote(details.remoteUrl)
              }
            })}
          />
        )}
        {(details.message === undefined || details.hunk === undefined) && (
          <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {details.hunk && <BlameHunkPreview hunk={details.hunk} />}
    </div>
  )
}
