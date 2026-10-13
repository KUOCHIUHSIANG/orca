import { ExternalLink, FileText, LoaderCircle, RefreshCw, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CommentMarkdownAsync } from '@/components/sidebar/comment-markdown-lazy'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { MondayIconAction } from './MondayIconAction'
import { MondayErrorBanner } from './MondayPageStates'
import type { MondayDocsController } from './use-monday-docs'

const EXTERNAL_URL = /^https?:\/\//i

export function MondayDocsToolbar(props: {
  docs: MondayDocsController
  onOpenSettings: () => void
}): React.JSX.Element {
  return (
    <div className="ml-auto flex items-center gap-2">
      <MondayIconAction
        label={translate('auto.components.mondayCalendar.toolbar.refresh', 'Refresh')}
        disabled={props.docs.loading}
        onClick={props.docs.refresh}
      >
        <RefreshCw className={cn(props.docs.loading && 'animate-spin')} />
      </MondayIconAction>
      <MondayIconAction
        label={translate('auto.components.mondayCalendar.toolbar.settings', 'Monday settings')}
        onClick={props.onOpenSettings}
      >
        <Settings />
      </MondayIconAction>
    </div>
  )
}

function DocsEmptyState(props: { onOpenSettings: () => void }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <FileText className="size-7 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {translate('auto.components.mondayCalendar.docs.emptyTitle', 'No docs yet')}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {translate(
            'auto.components.mondayCalendar.docs.emptyDescription',
            'Paste a monday doc URL (…/docs/123…) into Monday settings to read it here.'
          )}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={props.onOpenSettings}>
        {translate('auto.components.mondayCalendar.page.openSettings', 'Open settings')}
      </Button>
    </div>
  )
}

export function MondayDocsView(props: {
  docs: MondayDocsController
  onOpenSettings: () => void
}): React.JSX.Element {
  const { docs, selectedDoc, markdown, loading, error } = props.docs
  if (docs && docs.length === 0 && !error) {
    return <DocsEmptyState onOpenSettings={props.onOpenSettings} />
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <MondayErrorBanner
          error={error}
          onRetry={props.docs.refresh}
          onOpenSettings={props.onOpenSettings}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 px-3 pb-3 md:px-5">
        {/* Why: with a single doc the list is noise; it appears once there is a choice to make. */}
        {docs && docs.length > 1 ? (
          <nav className="scrollbar-sleek w-56 shrink-0 space-y-0.5 overflow-y-auto border-r border-border pr-2">
            {docs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                aria-current={doc.id === selectedDoc?.id ? 'page' : undefined}
                onClick={() => props.docs.select(doc.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent',
                  doc.id === selectedDoc?.id && 'bg-accent font-medium'
                )}
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{doc.name}</span>
              </button>
            ))}
          </nav>
        ) : null}
        <article className="scrollbar-sleek min-w-0 flex-1 overflow-y-auto px-6">
          {selectedDoc ? (
            <header className="mb-4 flex items-start gap-3 border-b border-border pb-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <h2 className="text-lg font-semibold leading-snug">{selectedDoc.name}</h2>
                {selectedDoc.updatedAt ? (
                  <p className="text-xs text-muted-foreground">
                    {translate('auto.components.mondayCalendar.docs.updated', 'Edited {{value0}}', {
                      value0: formatUiRelativeTimeFromDate(selectedDoc.updatedAt)
                    })}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void window.api.shell.openUrl(selectedDoc.url)}
              >
                <ExternalLink className="size-3.5" />
                {translate('auto.components.mondayCalendar.item.open', 'Open in Monday')}
              </Button>
            </header>
          ) : null}
          {markdown !== null ? (
            <CommentMarkdownAsync
              content={markdown}
              variant="document"
              className="pb-8 text-[14px] leading-relaxed"
              onLinkClick={(event, href) => {
                // Why: a followed link would navigate the Orca window itself.
                event.preventDefault()
                if (href && EXTERNAL_URL.test(href)) {
                  void window.api.shell.openUrl(href)
                }
              }}
            />
          ) : loading ? (
            <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              {translate('auto.components.mondayCalendar.docs.loading', 'Loading doc…')}
            </div>
          ) : null}
        </article>
      </div>
    </div>
  )
}
