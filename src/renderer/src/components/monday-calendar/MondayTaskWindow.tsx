import { useEffect, useState } from 'react'
import { CalendarDays, SquareArrowOutDownLeft } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { MondayTaskSelection } from '../../../../shared/detached-pages'
import { CalendarIconAction } from '../calendar/CalendarIconAction'
import { MondayItemDetails, MondayItemHeading } from './MondayItemPanel'

/** The task window: whichever task was last picked in the Monday calendar. */
export default function MondayTaskWindow(): React.JSX.Element {
  const [selection, setSelection] = useState<MondayTaskSelection | null>(null)

  useEffect(() => {
    const api = window.api.detachedPages
    let live = true
    const off = api.onMondayTask((next) => {
      live = false
      setSelection(next)
    })
    void api.currentMondayTask().then((current) => {
      // A pick that arrived meanwhile is newer than this snapshot.
      if (live && current) {
        setSelection(current)
      }
    })
    return off
  }, [])

  const item = selection?.item ?? null
  useEffect(() => {
    document.title = item ? `${item.name} · Monday` : 'Monday'
  }, [item])

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      {item && selection ? (
        <>
          <header className="flex shrink-0 items-start gap-1 border-b border-border py-2.5 pr-2 pl-4">
            <MondayItemHeading item={item} />
            <CalendarIconAction
              label={translate('auto.components.detachedPages.dock', 'Move back to main window')}
              onClick={() => void window.api.detachedPages.dock('monday-task')}
            >
              <SquareArrowOutDownLeft />
            </CalendarIconAction>
          </header>
          <MondayItemDetails item={item} ownerNames={selection.ownerNames} />
        </>
      ) : (
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
