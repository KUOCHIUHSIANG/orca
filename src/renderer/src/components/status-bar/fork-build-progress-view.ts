import { translate } from '@/i18n/i18n'
import type { ForkBuildProgress } from '../../../../shared/fork-build-progress-types'

const MINUTE_MS = 60_000

/** Plain words for the status bar: what is happening and roughly how long until the restart. */
export function describeForkBuildProgress(
  progress: ForkBuildProgress,
  now: number
): { label: string; tooltip: string; percent: number | null } {
  const elapsedMinutes = Math.floor((now - progress.startedAt) / MINUTE_MS)
  const tooltip =
    elapsedMinutes < 1
      ? translate('auto.components.forkBuild.justStarted', 'Just started')
      : translate('auto.components.forkBuild.elapsed', '{{value0}} min elapsed', {
          value0: elapsedMinutes
        })
  if (progress.phase === 'restart') {
    return {
      label: translate('auto.components.forkBuild.restarting', 'Restarting soon'),
      tooltip,
      percent: 100
    }
  }
  if (progress.phase === 'claude' || progress.estimatedEndAt === null) {
    return {
      label: translate('auto.components.forkBuild.claude', 'Claude is fixing conflicts'),
      tooltip,
      percent: null
    }
  }
  const remainingMs = progress.estimatedEndAt - now
  const span = progress.estimatedEndAt - progress.startedAt
  const percent =
    span > 0 ? Math.min(99, Math.max(0, ((now - progress.startedAt) / span) * 100)) : 0
  const left =
    remainingMs <= 0
      ? translate('auto.components.forkBuild.almostDone', 'almost done')
      : remainingMs < MINUTE_MS
        ? translate('auto.components.forkBuild.underMinute', 'under a minute left')
        : translate('auto.components.forkBuild.minutesLeft', 'about {{value0}} min left', {
            value0: Math.ceil(remainingMs / MINUTE_MS)
          })
  const doing =
    progress.phase === 'sync'
      ? translate('auto.components.forkBuild.syncing', 'Syncing upstream')
      : translate('auto.components.forkBuild.building', 'Building')
  return { label: `${doing} · ${left}`, tooltip, percent }
}
