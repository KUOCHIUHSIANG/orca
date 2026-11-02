import { ChevronDown, Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { PaneActionButton } from './PaneActionButton'
import type { PaneAction, PaneActionId } from './use-pane-actions'

function ActionMenu(props: {
  label: string
  icon: typeof Upload
  items: PaneAction[]
}): React.JSX.Element {
  const Icon = props.icon
  const reason = props.items.every((item) => item.disabledReason !== null)
    ? props.items[0]?.disabledReason
    : null
  const trigger = (
    <Button variant="ghost" size="sm" disabled={reason !== null && reason !== undefined}>
      <Icon />
      {props.label}
      <ChevronDown className="size-3 opacity-60" />
    </Button>
  )
  if (reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{trigger}</span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4} className="max-w-xs">
          {reason}
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabledReason !== null}
            onSelect={item.run}
          >
            <item.icon />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RemotePaneToolbar(props: {
  actions: Record<PaneActionId, PaneAction>
  split: boolean
}): React.JSX.Element {
  const { actions, split } = props
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
      <ActionMenu
        label={translate('auto.components.serverFiles.toolbar.upload', 'Upload')}
        icon={Upload}
        items={[actions['upload-files'], actions['upload-folders'], actions['upload-contents']]}
      />
      <PaneActionButton action={actions.mkdir} />
      <span className="mx-1 h-4 w-px bg-border" />
      <ActionMenu
        label={translate('auto.components.serverFiles.toolbar.download', 'Download')}
        icon={Download}
        items={[actions.download, actions['download-to']]}
      />
      <PaneActionButton action={actions.backup} />
      {split ? <PaneActionButton action={actions['copy-across']} /> : null}
      <span className="mx-1 h-4 w-px bg-border" />
      <PaneActionButton action={actions.rename} />
      <PaneActionButton action={actions.remove} />
    </div>
  )
}
