import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ForkBuildProgress } from '../../../../shared/fork-build-progress-types'
import { describeForkBuildProgress } from './fork-build-progress-view'

const TICK_MS = 10_000

/** How long until a fork update restarts Orca, for builds started by the update card or by hand. */
export function ForkBuildStatusSegment({
  progress,
  iconOnly
}: {
  progress: ForkBuildProgress | null
  iconOnly: boolean
}): React.JSX.Element | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!progress) {
      return
    }
    const refresh = (): void => setNow(Date.now())
    const first = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, TICK_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [progress])

  if (!progress) {
    return null
  }
  const view = describeForkBuildProgress(progress, now)
  const restarting = progress.phase === 'restart'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          tabIndex={0}
          aria-label={view.label}
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground',
            restarting && 'animate-fork-build-breathe'
          )}
        >
          {view.percent === null ? (
            <Loader2 className="size-3 animate-spin text-status-warning" />
          ) : (
            // Why the token swap: Progress paints its bar with --primary, so each phase recolors it
            // here (plain sync, blue build, green restart) without restyling the primitive.
            <span
              className={cn(
                'relative w-14',
                progress.phase === 'build' && '[--primary:var(--chart-2)]',
                restarting && '[--primary:var(--status-success)]'
              )}
            >
              <Progress value={view.percent} aria-hidden />
              {/* Why two clips: the bar's rounded outline, then the square-ended filled width, so
                  the light runs over finished work only and is round only where the bar itself is.
                  It fades out instead of unmounting so a sweep in flight hands off to the breathe. */}
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-0 overflow-hidden rounded-full transition-opacity duration-500',
                  restarting && 'opacity-0'
                )}
              >
                <span
                  // Matches the Progress indicator's 300ms ease-out so the clip grows with the fill.
                  className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-300 ease-out"
                  style={{ width: `${view.percent}%` }}
                >
                  <span className="animate-fork-build-shimmer absolute inset-0" />
                </span>
              </span>
            </span>
          )}
          {!iconOnly && <span className="text-2xs tabular-nums">{view.label}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {view.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
