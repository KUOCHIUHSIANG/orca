import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { MondayFailure } from '../../../../shared/monday-calendar-types'
import { describeMondayFailure } from './monday-failure-copy'
import { MondayConnectForm } from './MondayConnectForm'

const SETTINGS_FIXES: ReadonlySet<MondayFailure['kind']> = new Set([
  'unauthorized',
  'board-not-found',
  'doc-not-found'
])

export function MondayErrorBanner(props: {
  error: MondayFailure
  onRetry: () => void
  onOpenSettings: () => void
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="mx-3 mb-3 flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive md:mx-5"
    >
      <span className="min-w-0 flex-1">{describeMondayFailure(props.error)}</span>
      {SETTINGS_FIXES.has(props.error.kind) ? (
        <Button type="button" variant="outline" size="xs" onClick={props.onOpenSettings}>
          {translate('auto.components.mondayCalendar.page.openSettings', 'Open settings')}
        </Button>
      ) : (
        <Button type="button" variant="outline" size="xs" onClick={props.onRetry}>
          {translate('auto.components.mondayCalendar.page.retry', 'Retry')}
        </Button>
      )}
    </div>
  )
}

export function MondayConnectPanel(props: {
  initialReferences: readonly string[]
  onConnected: Parameters<typeof MondayConnectForm>[0]['onConnected']
}): React.JSX.Element {
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 justify-center overflow-y-auto px-3 pt-8 pb-6 md:px-5">
      <div className="h-fit w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 text-card-foreground">
        <div className="space-y-1.5">
          <CalendarDays className="size-7 text-muted-foreground" />
          <h2 className="text-sm font-semibold">
            {translate('auto.components.mondayCalendar.page.connectTitle', 'Connect Monday')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.mondayCalendar.page.connectDescription',
              'Reads your monday.com boards with a personal API token and shows each task’s start and end dates on a calendar. View only — nothing is changed in monday.com.'
            )}
          </p>
        </div>
        <MondayConnectForm
          initialReferences={props.initialReferences}
          hasStoredToken={false}
          submitLabel={translate('auto.components.mondayCalendar.page.connect', 'Connect')}
          onConnected={props.onConnected}
        />
      </div>
    </div>
  )
}
