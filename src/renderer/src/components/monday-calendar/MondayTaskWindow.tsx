import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ExternalLink,
  RefreshCw,
  SquareArrowOutDownLeft,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { MondayBrowserAction, MondayBrowserState } from '../../../../shared/detached-pages'

// Why native `title`, not Tooltip: the monday.com page is a separate view stacked over everything
// below this 40px bar, so a tooltip drawn in this renderer would be hidden under it.
function ToolbarButton(props: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}

/** The task window: a toolbar over the monday.com page of the task last picked in the calendar. */
export default function MondayTaskWindow(): React.JSX.Element {
  const [state, setState] = useState<MondayBrowserState | null>(null)

  useEffect(() => {
    const api = window.api.detachedPages
    let live = true
    const off = api.onMondayBrowserState((next) => {
      live = false
      setState(next)
    })
    void api.mondayBrowserState().then((initial) => {
      // A pushed state that arrived meanwhile is newer than this snapshot.
      if (live && initial) {
        setState(initial)
      }
    })
    return off
  }, [])

  const title = state?.title || 'Monday'
  useEffect(() => {
    document.title = title
  }, [title])

  const url = state?.url ?? null
  const run = (action: MondayBrowserAction) => () =>
    void window.api.detachedPages.mondayBrowser(action)

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <ToolbarButton
          label={translate('browser.navigation.back', 'Back')}
          disabled={!state?.canGoBack}
          onClick={run('back')}
        >
          <ArrowLeft />
        </ToolbarButton>
        <ToolbarButton
          label={translate('browser.navigation.forward', 'Forward')}
          disabled={!state?.canGoForward}
          onClick={run('forward')}
        >
          <ArrowRight />
        </ToolbarButton>
        {state?.loading ? (
          <ToolbarButton
            label={translate('auto.components.browser.pane.BrowserPane.b7e4d9c1a2', 'Stop')}
            onClick={run('stop')}
          >
            <X />
          </ToolbarButton>
        ) : (
          <ToolbarButton
            label={translate('browser.navigation.reload', 'Reload')}
            disabled={!url}
            onClick={run('reload')}
          >
            <RefreshCw />
          </ToolbarButton>
        )}
        <div
          className="mx-1 min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
          title={url ?? undefined}
        >
          {url ?? ''}
        </div>
        <ToolbarButton
          label={translate(
            'auto.components.browser.pane.BrowserPane.0f41bf80c7',
            'Open in default browser'
          )}
          disabled={!url}
          onClick={run('openExternal')}
        >
          <ExternalLink />
        </ToolbarButton>
        <ToolbarButton
          label={translate('auto.components.detachedPages.dock', 'Move back to main window')}
          onClick={() => void window.api.detachedPages.dock('monday-task')}
        >
          <SquareArrowOutDownLeft />
        </ToolbarButton>
      </header>
      {url ? null : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
          <CalendarDays className="size-6" />
          <p className="max-w-xs">
            {translate(
              'auto.components.detachedPages.mondayTaskEmpty',
              'Pick a task in the Monday calendar to show it here.'
            )}
          </p>
        </div>
      )}
    </main>
  )
}
