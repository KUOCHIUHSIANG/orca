import { useMemo, useRef, useState } from 'react'
import {
  isDatedMondayItem,
  type MondayCalendarItem
} from '../../../../shared/monday-calendar-types'
import type { TaiwanCalendarDay } from '../../../../shared/taiwan-holiday-types'
import { ownerNamesForItem } from './monday-calendar-filter'
import type { MonthCursor } from '../calendar/calendar-dates'
import { useCalendarPanelEscape } from '../calendar/use-calendar-panel-escape'
import { MondayItemPanel } from './MondayItemPanel'
import { MondayMonthGrid } from './MondayMonthGrid'
import { MondayUndatedSection } from './MondayUndatedSection'

export function MondayCalendarWorkspace(props: {
  cursor: MonthCursor
  items: readonly MondayCalendarItem[]
  holidaysByDate: ReadonlyMap<string, readonly TaiwanCalendarDay[]>
  peopleById: ReadonlyMap<string, string>
  selectedPersonIds: readonly string[] | null
  undatedExpanded: boolean
  onUndatedExpandedChange: (expanded: boolean) => void
}): React.JSX.Element {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const undatedItems = useMemo(
    () => props.items.filter((item) => !isDatedMondayItem(item)),
    [props.items]
  )
  // Why: a task hidden by the filters closes its panel instead of lingering out of view.
  const selectedItem = props.items.find((item) => item.id === selectedItemId) ?? null
  const showOwnerNames = props.selectedPersonIds === null || props.selectedPersonIds.length > 1
  const selectItem = (itemId: string): void =>
    setSelectedItemId((current) => (current === itemId ? null : itemId))
  const panelOpen = selectedItem !== null

  useCalendarPanelEscape(panelOpen, containerRef, () => setSelectedItemId(null))

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <MondayUndatedSection
          items={undatedItems}
          expanded={props.undatedExpanded}
          onExpandedChange={props.onUndatedExpandedChange}
          ownerNamesFor={(item) =>
            showOwnerNames ? ownerNamesForItem(item, props.peopleById, props.selectedPersonIds) : []
          }
          selectedItemId={selectedItem?.id ?? null}
          onSelectItem={selectItem}
        />
        <MondayMonthGrid
          cursor={props.cursor}
          items={props.items}
          holidaysByDate={props.holidaysByDate}
          peopleById={props.peopleById}
          selectedPersonIds={props.selectedPersonIds}
          selectedItemId={selectedItem?.id ?? null}
          onSelectItem={selectItem}
        />
      </div>
      {selectedItem ? (
        <MondayItemPanel
          item={selectedItem}
          ownerNames={ownerNamesForItem(selectedItem, props.peopleById, null)}
          onClose={() => setSelectedItemId(null)}
        />
      ) : null}
    </div>
  )
}
