import { SquareArrowOutDownLeft, SquareArrowOutUpRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { CalendarIconAction } from '../calendar/CalendarIconAction'
import { canDetachPages, currentDetachedPage } from './detached-page-location'
import type { DetachablePage } from './detached-page-labels'

/** The page header's last control: open the page in its own window, or move it back. */
export function DetachedPageHeaderAction(props: {
  page: DetachablePage
}): React.JSX.Element | null {
  if (!canDetachPages()) {
    return null
  }
  const api = window.api.detachedPages
  const detached = currentDetachedPage() === props.page
  return (
    <div className="ml-auto flex shrink-0 items-center">
      {detached ? (
        <CalendarIconAction
          label={translate('auto.components.detachedPages.dock', 'Move back to main window')}
          onClick={() => void api.dock(props.page)}
        >
          <SquareArrowOutDownLeft />
        </CalendarIconAction>
      ) : (
        <CalendarIconAction
          label={translate('auto.components.detachedPages.openWindow', 'Open in separate window')}
          onClick={() => void api.open(props.page)}
        >
          <SquareArrowOutUpRight />
        </CalendarIconAction>
      )}
    </div>
  )
}
