import type React from 'react'
import { ArrowDown, ArrowUp, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

function PeekHeaderButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
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
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function GitChangePeekHeader({
  fileName,
  hunkIndex,
  hunkCount,
  onRevert,
  onPrevious,
  onNext,
  onClose
}: {
  fileName: string
  hunkIndex: number
  hunkCount: number
  /** Omitted for read-only buffers. */
  onRevert?: () => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}): React.JSX.Element {
  const canNavigate = hunkCount > 1
  return (
    <div className="flex h-full items-center gap-2 border-b border-border px-3 font-sans text-xs">
      <span className="truncate font-medium text-foreground">{fileName}</span>
      <span className="shrink-0 text-muted-foreground">
        {translate('auto.components.editor.GitChangePeekHeader.457d2979e3', 'Uncommitted changes')}
      </span>
      <span className="shrink-0 text-muted-foreground">
        {translate(
          'auto.components.editor.GitChangePeekHeader.786781f46d',
          '{{value0}} of {{value1}}',
          {
            value0: hunkIndex + 1,
            value1: hunkCount
          }
        )}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {onRevert && (
          <PeekHeaderButton
            label={translate(
              'auto.components.editor.GitChangePeekHeader.ca3f71d030',
              'Revert change'
            )}
            onClick={onRevert}
          >
            <Undo2 />
          </PeekHeaderButton>
        )}
        <PeekHeaderButton
          label={translate(
            'auto.components.editor.GitChangePeekHeader.48cca39ed8',
            'Previous change'
          )}
          disabled={!canNavigate}
          onClick={onPrevious}
        >
          <ArrowUp />
        </PeekHeaderButton>
        <PeekHeaderButton
          label={translate('auto.components.editor.GitChangePeekHeader.d3d50ef92d', 'Next change')}
          disabled={!canNavigate}
          onClick={onNext}
        >
          <ArrowDown />
        </PeekHeaderButton>
        <PeekHeaderButton
          label={translate('auto.components.editor.GitChangePeekHeader.29fd43681e', 'Close')}
          onClick={onClose}
        >
          <X />
        </PeekHeaderButton>
      </div>
    </div>
  )
}
