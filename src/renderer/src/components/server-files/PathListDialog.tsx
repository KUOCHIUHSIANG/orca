import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'

export type PathListRequest = {
  title: string
  message?: string
  /** Full paths, one per line, exactly as the action will touch them. */
  paths: { path: string; note?: string }[]
  notes?: string[]
  confirmLabel: string
  destructive?: boolean
  /** Information only: a single OK button. */
  acknowledgeOnly?: boolean
}

export function PathListDialog(props: {
  request: PathListRequest | null
  onSettle: (confirmed: boolean) => void
}): React.JSX.Element {
  const { request, onSettle } = props
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onSettle(false)}>
      <DialogContent
        surface="security"
        showCloseButton={false}
        className="sm:max-w-2xl"
        onOpenAutoFocus={(event) => {
          // A destructive prompt starts on Cancel, so Enter can't confirm by accident.
          if (request?.destructive) {
            event.preventDefault()
            cancelRef.current?.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.message ? (
            <DialogDescription className="whitespace-pre-line">{request.message}</DialogDescription>
          ) : null}
        </DialogHeader>
        {request?.paths.length ? (
          <ol className="scrollbar-sleek max-h-72 overflow-y-auto rounded-md border border-border bg-muted/30 py-1 font-mono text-xs">
            {request?.paths.map((entry, index) => (
              <li key={entry.path} className="flex gap-3 px-3 py-0.5">
                <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 break-all">{entry.path}</span>
                {entry.note ? (
                  <span className="shrink-0 font-sans text-muted-foreground">{entry.note}</span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
        {request?.notes?.length ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {request.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          {request?.acknowledgeOnly ? (
            <Button onClick={() => onSettle(false)}>{request.confirmLabel}</Button>
          ) : (
            <>
              <Button ref={cancelRef} variant="ghost" onClick={() => onSettle(false)}>
                {translate('auto.components.serverFiles.dialog.cancel', 'Cancel')}
              </Button>
              <Button
                variant={request?.destructive ? 'destructive' : 'default'}
                onClick={() => onSettle(true)}
              >
                {request?.confirmLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
