import { cn } from '@/lib/utils'
import { MondayStatusDot } from './MondayStatusDot'
import type { MondayWeekSegment } from './monday-month-layout'

export function MondayItemBar(props: {
  segment: MondayWeekSegment
  /** Names printed on the bar; empty hides the owner suffix. */
  ownerNames: readonly string[]
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const { segment } = props
  const { item } = segment
  return (
    <button
      type="button"
      onClick={props.onSelect}
      aria-pressed={props.selected}
      style={{
        gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
        gridRow: segment.lane + 1,
        // Why: a pale wash of the monday status color, mixed against the card so dark mode stays dark;
        // status-less tasks get a stronger neutral wash so they don't melt into the grid.
        backgroundColor: item.statusColor
          ? `color-mix(in srgb, ${item.statusColor} 20%, var(--card))`
          : 'color-mix(in srgb, var(--muted-foreground) 28%, var(--card))'
      }}
      className={cn(
        'mx-1 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs text-foreground transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-125',
        segment.continuesBefore && 'ml-0 rounded-l-none',
        segment.continuesAfter && 'mr-0 rounded-r-none',
        item.isDone && 'text-muted-foreground opacity-70',
        props.selected && 'ring-2 ring-ring'
      )}
    >
      <MondayStatusDot color={item.statusColor} />
      <span className="min-w-0 truncate">{item.name}</span>
      {props.ownerNames.length > 0 ? (
        <span className="max-w-[40%] shrink-0 truncate text-muted-foreground">
          {props.ownerNames.join(', ')}
        </span>
      ) : null}
    </button>
  )
}
