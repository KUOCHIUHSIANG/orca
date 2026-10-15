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
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          tabIndex={0}
          aria-label={view.label}
          className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground"
        >
          {view.percent === null ? (
            <Loader2 className="size-3 animate-spin text-status-warning" />
          ) : (
            // Why the token swap: Progress paints its bar with --primary, so each phase recolors it
            // here (plain sync, blue build, green restart) without restyling the primitive.
            <span
              className={cn(
                'w-14',
                progress.phase === 'build' && '[--primary:var(--chart-2)]',
                progress.phase === 'restart' && '[--primary:var(--status-success)]'
              )}
            >
              <Progress value={view.percent} aria-hidden />
            </span>
          )}
          {!iconOnly && <span className="text-[11px] tabular-nums">{view.label}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {view.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
