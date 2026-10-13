import { ExternalLink, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MondayCalendarItem } from '../../../../shared/monday-calendar-types'
import { describeMondayFailure } from './monday-failure-copy'
import { formatMondayDateRange } from './monday-date-range-format'
import { MondayIconAction } from './MondayIconAction'
import { MondayStatusDot } from './MondayStatusDot'
import { MondayUpdateCard } from './MondayUpdateCard'
import { useMondayItemUpdates } from './use-monday-item-updates'

function ItemFacts(props: {
  item: MondayCalendarItem
  ownerNames: readonly string[]
}): React.JSX.Element {
  const { item } = props
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
      <dt className="text-muted-foreground">
        {translate('auto.components.mondayCalendar.item.board', 'Board')}
      </dt>
      <dd className="min-w-0">
        {item.groupTitle ? `${item.boardName} · ${item.groupTitle}` : item.boardName}
      </dd>
      <dt className="text-muted-foreground">
        {translate('auto.components.mondayCalendar.item.status', 'Status')}
      </dt>
      <dd className="flex items-center gap-1.5">
        <MondayStatusDot color={item.statusColor} />
        {item.statusLabel ?? '—'}
      </dd>
      <dt className="text-muted-foreground">
        {translate('auto.components.mondayCalendar.item.owners', 'Owners')}
      </dt>
      <dd className="min-w-0">{props.ownerNames.length > 0 ? props.ownerNames.join(', ') : '—'}</dd>
      <dt className="text-muted-foreground">
        {translate('auto.components.mondayCalendar.item.dates', 'Dates')}
      </dt>
      <dd>
        {formatMondayDateRange(item) ??
          translate('auto.components.mondayCalendar.undated.title', 'No date')}
      </dd>
    </dl>
  )
}

function ItemDiscussion(props: { itemId: string }): React.JSX.Element {
  const { updates, loading, error, refresh } = useMondayItemUpdates(props.itemId)
  return (
    <section className="space-y-3 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {translate('auto.components.mondayCalendar.panel.updates', 'Updates')}
          {updates ? ` · ${updates.length}` : ''}
        </h3>
        <MondayIconAction
          label={translate(
            'auto.components.mondayCalendar.panel.refreshUpdates',
            'Refresh updates'
          )}
          disabled={loading}
          onClick={refresh}
        >
          <RefreshCw className={cn(loading && 'animate-spin')} />
        </MondayIconAction>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {describeMondayFailure(error)}
        </p>
      ) : null}
      {updates === null && loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          {translate('auto.components.mondayCalendar.panel.loadingUpdates', 'Loading updates…')}
        </div>
      ) : null}
      {updates?.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate('auto.components.mondayCalendar.panel.noUpdates', 'No updates yet.')}
        </p>
      ) : null}
      {updates?.map((update) => (
        <MondayUpdateCard key={update.id} update={update} />
      ))}
    </section>
  )
}

export function MondayItemPanel(props: {
  item: MondayCalendarItem
  ownerNames: readonly string[]
  onClose: () => void
}): React.JSX.Element {
  const { item } = props
  return (
    <aside
      aria-label={item.name}
      className="mr-3 mb-3 flex w-[440px] max-w-[45%] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-background md:mr-5"
    >
      <header className="flex shrink-0 items-start gap-1 border-b border-border py-2.5 pr-2 pl-4">
        <div className="min-w-0 flex-1 space-y-0.5 py-1">
          <h2 className="text-sm font-semibold leading-snug">{item.name}</h2>
          {item.parentItemName ? (
            <p className="text-xs text-muted-foreground">
              {translate('auto.components.mondayCalendar.item.subitemOf', 'Subitem of {{value0}}', {
                value0: item.parentItemName
              })}
            </p>
          ) : null}
        </div>
        <MondayIconAction
          label={translate('auto.components.mondayCalendar.panel.close', 'Close')}
          onClick={props.onClose}
        >
          <X />
        </MondayIconAction>
      </header>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 border-b border-border px-4 py-4">
          <ItemFacts item={item} ownerNames={props.ownerNames} />
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => void window.api.shell.openUrl(item.url)}
          >
            <ExternalLink className="size-3.5" />
            {translate('auto.components.mondayCalendar.item.open', 'Open in Monday')}
          </Button>
        </div>
        <ItemDiscussion key={item.id} itemId={item.id} />
      </div>
    </aside>
  )
}
