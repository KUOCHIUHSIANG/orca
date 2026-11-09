import { SquareArrowOutUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { detachedPageLabel, type DetachablePage } from './detached-page-labels'
import { useDetachedPageOpen } from './detached-pages-store'

/** In the main window, a page living in its own window shows where it went instead. */
export function DetachedPageGate(props: {
  page: DetachablePage
  children: React.ReactNode
}): React.JSX.Element {
  const detached = useDetachedPageOpen(props.page)
  if (!detached) {
    return <>{props.children}</>
  }
  const api = window.api.detachedPages
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center text-sm text-foreground">
      <SquareArrowOutUpRight className="size-6 text-muted-foreground" />
      <p className="max-w-sm text-muted-foreground">
        {translate(
          'auto.components.detachedPages.placeholder',
          '{{value0}} is open in a separate window.',
          { value0: detachedPageLabel(props.page) }
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void api.open(props.page)}>
          {translate('auto.components.detachedPages.showWindow', 'Show window')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void api.dock(props.page)}>
          {translate('auto.components.detachedPages.dockHere', 'Move back here')}
        </Button>
      </div>
    </main>
  )
}
