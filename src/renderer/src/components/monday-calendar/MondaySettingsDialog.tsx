import { useState } from 'react'
import { LoaderCircle, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { translate } from '@/i18n/i18n'
import type {
  MondayBoardDisplaySettings,
  MondayBoardSummary,
  MondayConnectionStatus
} from '../../../../shared/monday-calendar-types'
import { MondayBoardDisplaySection } from './MondayBoardDisplaySection'
import { connectionReferenceLines, MondayConnectForm } from './MondayConnectForm'

export function MondaySettingsDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: MondayConnectionStatus
  onConnected: (status: MondayConnectionStatus) => void
  onDisconnect: () => Promise<void>
  boards: readonly MondayBoardSummary[]
  onBoardSettingsChange: (settings: MondayBoardDisplaySettings) => void
}): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  const disconnect = async (): Promise<void> => {
    setDisconnecting(true)
    setDisconnectError(null)
    try {
      await props.onDisconnect()
      props.onOpenChange(false)
    } catch (error) {
      if (mountedRef.current) {
        setDisconnectError(
          readIpcErrorMessage(error) ??
            translate(
              'auto.components.mondayCalendar.settings.disconnectFailed',
              'Could not remove the saved monday.com token.'
            )
        )
      }
    } finally {
      if (mountedRef.current) {
        setDisconnecting(false)
      }
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.mondayCalendar.settings.title', 'Monday settings')}
          </DialogTitle>
          <DialogDescription>
            {props.status.connectedAs
              ? translate(
                  'auto.components.mondayCalendar.settings.connectedAs',
                  'Reading boards with {{value0}}’s API token. View only — nothing is changed in monday.com.',
                  { value0: props.status.connectedAs }
                )
              : translate(
                  'auto.components.mondayCalendar.settings.description',
                  'View only — nothing is changed in monday.com.'
                )}
          </DialogDescription>
        </DialogHeader>
        {/* Why: remount per open so a cancelled edit doesn't linger in the fields. */}
        {props.open ? (
          <MondayConnectForm
            initialReferences={connectionReferenceLines(props.status)}
            hasStoredToken
            submitLabel={translate('auto.components.mondayCalendar.settings.save', 'Save')}
            onConnected={(status) => {
              props.onConnected(status)
              props.onOpenChange(false)
            }}
            secondaryAction={
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={disconnecting}
                onClick={() => void disconnect()}
              >
                {disconnecting ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Unlink className="size-3.5" />
                )}
                {translate('auto.components.mondayCalendar.settings.disconnect', 'Disconnect')}
              </Button>
            }
          />
        ) : null}
        {props.open ? (
          <MondayBoardDisplaySection
            boards={props.boards}
            settings={props.status.boardSettings}
            onChange={props.onBoardSettingsChange}
          />
        ) : null}
        {disconnectError ? (
          <p role="alert" className="text-xs text-destructive">
            {disconnectError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
