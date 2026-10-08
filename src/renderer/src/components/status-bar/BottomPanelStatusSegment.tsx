import { PanelBottom } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useBottomPanelState } from '@/lib/bottom-panel-state'

export function BottomPanelStatusSegment(): React.JSX.Element {
  const open = useBottomPanelState((state) => state.open)
  const toggle = useBottomPanelState((state) => state.toggle)
  const label = open ? 'Hide bottom panel' : 'Show bottom panel'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={open}
          onClick={toggle}
          className={cn(
            'inline-flex cursor-pointer items-center rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground',
            open && 'bg-accent text-foreground'
          )}
        >
          <PanelBottom className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
