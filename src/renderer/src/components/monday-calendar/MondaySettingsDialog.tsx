import { useId, useState } from 'react'
import { LoaderCircle, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/runtime/errors/ipc-error'
import { translate } from '@/i18n/i18n'
import { useTranslate } from '@/i18n/use-translate'
import type {
  MondayBoardDisplaySettings,
  MondayBoardSummary,
  MondayConnectionStatus,
  MondayPerson
} from '../../../../shared/monday-calendar-types'
import { MondayBoardDisplaySection } from './MondayBoardDisplaySection'
import { connectionReferenceLines, MondayConnectForm } from './MondayConnectForm'

const NOTIFICATIONS_OFF = '__off__'

function NotificationRecipientSection(props: {
  people: readonly MondayPerson[]
  notifyPersonId: string | null
  onChange: (personId: string | null) => void
}): React.JSX.Element {
  const t = useTranslate()
  const fieldId = useId()
  const { notifyPersonId } = props
  // Why: the people list comes from the calendar, which may not have loaded yet.
  const people =
    notifyPersonId && !props.people.some((person) => person.id === notifyPersonId)
      ? [...props.people, { id: notifyPersonId, name: notifyPersonId }]
      : props.people
  return (
    <section className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center gap-3">
        <Label htmlFor={fieldId} className="shrink-0">
          {t('auto.components.mondayCalendar.notifications.recipient', 'Notify me as')}
        </Label>
        <Select
          value={notifyPersonId ?? NOTIFICATIONS_OFF}
          onValueChange={(value) => props.onChange(value === NOTIFICATIONS_OFF ? null : value)}
        >
          <SelectTrigger id={fieldId} size="sm" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOTIFICATIONS_OFF}>
              {t('auto.components.mondayCalendar.notifications.off', 'Off')}
            </SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'auto.components.mondayCalendar.notifications.recipientHint',
          'Checks every 3 minutes, less often while the computer is idle, for mentions, replies in your threads, being added as an owner, and new comments or status changes on your tasks. Comments by monday agents are skipped.'
        )}
      </p>
    </section>
  )
}

export function MondaySettingsDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: MondayConnectionStatus
  onConnected: (status: MondayConnectionStatus) => void
  onDisconnect: () => Promise<void>
  boards: readonly MondayBoardSummary[]
  onBoardSettingsChange: (settings: MondayBoardDisplaySettings) => void
  onShowTaiwanHolidaysChange: (show: boolean) => void
  people: readonly MondayPerson[]
  onNotifyPersonIdChange: (personId: string | null) => void
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
      <DialogContent className="sm:max-w-md" scrollable>
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
          <section className="border-t border-border pt-4">
            <label className="flex cursor-pointer items-start gap-2.5">
              <Switch
                className="mt-0.5"
                checked={props.status.showTaiwanHolidays}
                onCheckedChange={props.onShowTaiwanHolidaysChange}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  {translate(
                    'auto.components.mondayCalendar.holidays.toggle',
                    'Show Taiwan public holidays'
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {translate(
                    'auto.components.mondayCalendar.holidays.source',
                    'From the government office calendar (New Taipei open data), refreshed weekly.'
                  )}
                </span>
              </span>
            </label>
          </section>
        ) : null}
        {props.open ? (
          <NotificationRecipientSection
            people={props.people}
            notifyPersonId={props.status.notifyPersonId}
            onChange={props.onNotifyPersonIdChange}
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
