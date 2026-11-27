import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { isValidRemoteEntryName } from '../../../../shared/server-files-paths'

export type NameRequest = {
  title: string
  label: string
  initial: string
  confirmLabel: string
  /** Names already in the folder, so a clash shows before the server refuses it. */
  taken: readonly string[]
}

function NameBody(props: {
  request: NameRequest
  onSettle: (name: string | null) => void
}): React.JSX.Element {
  const { request, onSettle } = props
  const [value, setValue] = useState(request.initial)
  const trimmed = value.trim()
  const unchanged = trimmed === request.initial
  const invalid = trimmed !== '' && !isValidRemoteEntryName(trimmed)
  const taken = !unchanged && request.taken.includes(trimmed)
  const canSubmit = trimmed !== '' && !invalid && !taken && !unchanged
  const submit = (): void => {
    if (canSubmit) {
      onSettle(trimmed)
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="server-files-name">{request.label}</Label>
        <Input
          id="server-files-name"
          autoFocus
          value={value}
          aria-invalid={invalid || taken}
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => {
            // Select the name without its extension, as Finder does.
            const dot = event.target.value.lastIndexOf('.')
            event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {invalid || taken ? (
          <p className="text-xs text-destructive">
            {taken
              ? translate(
                  'auto.components.serverFiles.name.taken',
                  'Something with this name is already here'
                )
              : translate(
                  'auto.components.serverFiles.name.invalid',
                  'Names cannot contain / or be . or ..'
                )}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onSettle(null)}>
          {translate('auto.components.serverFiles.dialog.cancel', 'Cancel')}
        </Button>
        <Button disabled={!canSubmit} onClick={submit}>
          {request.confirmLabel}
        </Button>
      </DialogFooter>
    </>
  )
}

/** The body remounts per request, so the field starts from that request's name. */
export function RemoteNameDialog(props: {
  request: NameRequest | null
  onSettle: (name: string | null) => void
}): React.JSX.Element {
  const { request, onSettle } = props
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onSettle(null)}>
      <DialogContent size="compact" showCloseButton={false}>
        {request ? <NameBody request={request} onSettle={onSettle} /> : null}
      </DialogContent>
    </Dialog>
  )
}
