import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PaneAction } from './use-pane-actions'

/** Disabled buttons don't receive pointer events, so the tooltip with the reason sits on a wrapper. */
export function PaneActionButton({
  action,
  iconOnly = false
}: {
  action: PaneAction
  iconOnly?: boolean
}): React.JSX.Element {
  const Icon = action.icon
  const button = (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon-sm' : 'sm'}
      disabled={action.disabledReason !== null}
      onClick={action.run}
      aria-label={iconOnly ? action.label : undefined}
    >
      <Icon />
      {iconOnly ? null : action.label}
    </Button>
  )
  if (action.disabledReason === null && !iconOnly) {
    return button
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="max-w-xs">
        {action.disabledReason ?? action.label}
      </TooltipContent>
    </Tooltip>
  )
}
