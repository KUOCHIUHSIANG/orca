import { useEffect, useState } from 'react'
import { CircleCheck, X } from 'lucide-react'
import type { ForkSyncSummary } from '../../../shared/fork-sync-summary-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { translate } from '@/i18n/i18n'

/** A fork update restarts the app on its own, so the new build says once what the sync handled. */
export function ForkSyncSummaryCard(): React.JSX.Element | null {
  const [summary, setSummary] = useState<ForkSyncSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    // Why optional: web clients have no fork sync bridge.
    void window.api.forkSync
      ?.getSummary()
      .then((result) => {
        if (!cancelled) {
          setSummary(result)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!summary) {
    return null
  }

  const handleClose = (): void => {
    setSummary(null)
    void window.api.forkSync?.dismissSummary(summary.id)
  }

  return (
    <div>
      <Card role="complementary" aria-labelledby="fork-sync-summary-heading">
        <CardHeader>
          <CardTitle id="fork-sync-summary-heading">
            <span className="flex items-center gap-2">
              <CircleCheck className="size-4 text-muted-foreground" />
              {translate('auto.components.forkUpdate.updatedTitle', 'Updated to {{value0}}', {
                value0: summary.version
              })}
            </span>
          </CardTitle>
          <CardDescription>
            {translate(
              'auto.components.forkUpdate.syncNotesTitle',
              'Handled automatically during sync'
            )}
          </CardDescription>
          <div
            data-slot="card-action"
            className="col-start-2 row-span-2 row-start-1 self-start justify-self-end"
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleClose}
              aria-label={translate('auto.components.forkUpdate.dismiss', 'Dismiss')}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground scrollbar-sleek">
            {summary.summary}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
