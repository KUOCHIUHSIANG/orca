import { useState } from 'react'
import {
  Archive,
  ChevronDown,
  CircleCheck,
  CircleSlash,
  CircleX,
  Copy,
  Download,
  Loader2,
  Trash2,
  Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import type { JobOutcome } from '../../../../shared/server-files-types'
import { useServerJobsStore, type ServerJob, type ServerJobKind } from './server-files-jobs-store'
import { errorSummary, formatBytes } from './server-files-messages'
import { cancelServerJob } from './server-files-run-job'

const KIND_ICONS: Record<ServerJobKind, typeof Upload> = {
  upload: Upload,
  download: Download,
  remove: Trash2,
  copy: Copy,
  backup: Archive
}

function outcomeLines(outcome: JobOutcome | null): string[] {
  if (!outcome || outcome.status !== 'done') {
    return []
  }
  const lines: string[] = []
  if (outcome.verification) {
    lines.push(
      outcome.verification.mismatches.length === 0
        ? translate(
            'auto.components.serverFiles.jobs.verified',
            'Checked {{value0}} files: sizes and times match',
            {
              value0: outcome.verification.checkedFiles
            }
          )
        : translate(
            'auto.components.serverFiles.jobs.mismatched',
            '{{value0}} of {{value1}} files differ from the original',
            {
              value0: outcome.verification.mismatches.length,
              value1: outcome.verification.checkedFiles
            }
          )
    )
  }
  for (const warning of outcome.warnings) {
    lines.push(
      warning.code === 'times-not-preserved'
        ? translate(
            'auto.components.serverFiles.jobs.timesNotPreserved',
            '{{value0}} files kept the upload time (you do not own them)',
            {
              value0: warning.count
            }
          )
        : translate(
            'auto.components.serverFiles.jobs.existingKept',
            '{{value0}} existing items were kept',
            {
              value0: warning.count
            }
          )
    )
  }
  return lines
}

function JobRow({ job }: { job: ServerJob }): React.JSX.Element {
  const Icon = KIND_ICONS[job.kind]
  const progress = job.progress
  const elapsedSeconds = Math.max(1, (job.updatedAt - job.startedAt) / 1000)
  const percent =
    progress && progress.totalBytes > 0
      ? (progress.transferredBytes / progress.totalBytes) * 100
      : progress && progress.totalFiles > 0
        ? (progress.completedFiles / progress.totalFiles) * 100
        : 0
  const mismatches =
    job.outcome?.status === 'done' ? (job.outcome.verification?.mismatches ?? []) : []
  const { error, localPath } = job
  const doneLines = outcomeLines(job.outcome)
  return (
    <li className="space-y-1 border-b border-border/60 px-3 py-2 last:border-0">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{job.title}</span>
        {job.status === 'running' ? (
          <>
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <Button variant="ghost" size="xs" onClick={() => cancelServerJob(job.jobId)}>
              {translate('auto.components.serverFiles.jobs.cancel', 'Cancel')}
            </Button>
          </>
        ) : job.status === 'done' ? (
          <CircleCheck className="size-4 text-status-success" />
        ) : job.status === 'cancelled' ? (
          <CircleSlash className="size-4 text-muted-foreground" />
        ) : (
          <CircleX className="size-4 text-destructive" />
        )}
      </div>
      {job.status === 'running' && progress ? (
        <div className="space-y-1 pl-6">
          <Progress value={percent} className="h-1.5" />
          <p className="flex gap-2 text-2xs text-muted-foreground tabular-nums">
            <span>
              {translate('auto.components.serverFiles.jobs.files', '{{value0}}/{{value1}} items', {
                value0: progress.completedFiles,
                value1: progress.totalFiles
              })}
            </span>
            {progress.totalBytes > 0 ? (
              <span>
                {formatBytes(progress.transferredBytes)} / {formatBytes(progress.totalBytes)} ·{' '}
                {translate('auto.components.serverFiles.jobs.speed', '{{value0}}/s', {
                  value0: formatBytes(progress.transferredBytes / elapsedSeconds)
                })}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 truncate font-mono">{progress.currentPath}</span>
          </p>
        </div>
      ) : null}
      {job.status === 'failed' && error ? (
        <div className="space-y-1 pl-6 text-xs">
          <p className="text-destructive">{errorSummary(error)}</p>
          {error.detail && error.detail !== error.message ? (
            <p className="font-mono text-2xs text-muted-foreground break-all">{error.detail}</p>
          ) : null}
          <div className="flex gap-1">
            {job.retry ? (
              <Button variant="outline" size="xs" onClick={job.retry}>
                {translate('auto.components.serverFiles.jobs.retry', 'Try again')}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                void navigator.clipboard.writeText(
                  [errorSummary(error), error.detail].filter(Boolean).join('\n')
                )
              }
            >
              {translate('auto.components.serverFiles.jobs.copyError', 'Copy error')}
            </Button>
          </div>
        </div>
      ) : null}
      {job.status === 'done' ? (
        <div className="space-y-1 pl-6 text-xs text-muted-foreground">
          {doneLines.map((line, position) => (
            <p
              key={line}
              className={cn(mismatches.length > 0 && position === 0 && 'text-destructive')}
            >
              {line}
            </p>
          ))}
          {mismatches.length > 0 ? (
            <ul className="font-mono text-2xs">
              {mismatches.slice(0, 20).map((mismatch) => (
                <li key={mismatch.path} className="break-all">
                  {mismatch.path}
                </li>
              ))}
            </ul>
          ) : null}
          {job.reveal ? (
            <Button variant="outline" size="xs" onClick={job.reveal}>
              {translate('auto.components.serverFiles.jobs.reveal', 'Go to the copies')}
            </Button>
          ) : null}
          {localPath ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => void window.api.serverFiles.showInFolder({ path: localPath })}
            >
              {translate('auto.components.serverFiles.download.show', 'Show in folder')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export function TransfersPanel({ serverId }: { serverId: string }): React.JSX.Element | null {
  const jobs = useServerJobsStore((s) => s.jobs)
  const clearFinished = useServerJobsStore((s) => s.clearFinished)
  const [collapsed, setCollapsed] = useState(false)
  const mine = jobs.filter((job) => job.serverId === serverId)
  if (mine.length === 0) {
    return null
  }
  const running = mine.filter((job) => job.status === 'running').length
  return (
    <div className="flex max-h-72 shrink-0 flex-col border-t border-border">
      <div className="flex h-8 shrink-0 items-center gap-2 px-3">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
        >
          <ChevronDown className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')} />
          {translate('auto.components.serverFiles.jobs.title', 'Transfers')}
          {running > 0 ? <span className="text-muted-foreground">({running})</span> : null}
        </button>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={clearFinished}
          disabled={running === mine.length}
        >
          {translate('auto.components.serverFiles.jobs.clear', 'Clear finished')}
        </Button>
      </div>
      {collapsed ? null : (
        <ul className="scrollbar-sleek min-h-0 overflow-y-auto">
          {mine.map((job) => (
            <JobRow key={job.jobId} job={job} />
          ))}
        </ul>
      )}
    </div>
  )
}
