import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, FileText } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import type {
  MondayBoardDisplaySettings,
  MondayPageTab
} from '../../../../shared/monday-calendar-types'
import {
  effectiveBoardSelection,
  filterMondayItems,
  listMondayPeopleWithItems
} from './monday-calendar-filter'
import { monthCursorOf, toLocalIsoDate } from '../calendar/calendar-dates'
import { MondayCalendarToolbar } from './MondayCalendarToolbar'
import { connectionReferenceLines } from './MondayConnectForm'
import { MondayDocsToolbar, MondayDocsView } from './MondayDocsView'
import { MondayConnectPanel, MondayErrorBanner } from './MondayPageStates'
import { MondayCalendarWorkspace } from './MondayCalendarWorkspace'
import { MondaySettingsDialog } from './MondaySettingsDialog'
import { useMondayCalendar } from './use-monday-calendar'
import { useMondayDocs } from './use-monday-docs'
import { useTaiwanHolidays } from '../calendar/use-taiwan-holidays'

const EMPTY_BOARD_SETTINGS: MondayBoardDisplaySettings = {}

function MondayPageTabs(props: {
  value: MondayPageTab
  onChange: (tab: MondayPageTab) => void
}): React.JSX.Element {
  return (
    <Tabs
      value={props.value}
      onValueChange={(value) => props.onChange(value === 'docs' ? 'docs' : 'calendar')}
    >
      <TabsList>
        <TabsTrigger value="calendar">
          <CalendarDays />
          {translate('auto.components.mondayCalendar.tabs.calendar', 'Calendar')}
        </TabsTrigger>
        <TabsTrigger value="docs">
          <FileText />
          {translate('auto.components.mondayCalendar.tabs.docs', 'Docs')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

export default function MondayCalendarPage(): React.JSX.Element {
  const calendar = useMondayCalendar()
  const [cursor, setCursor] = useState(() => monthCursorOf(new Date()))
  const [today] = useState(() => toLocalIsoDate(new Date()))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { status, snapshot } = calendar
  const connected = status?.connected === true
  const selectedPersonIds = status?.selectedPersonIds ?? null
  const showDone = status?.showDone ?? false
  const tab = status?.activeTab ?? 'calendar'
  const docsKey = status?.docs.map((doc) => doc.objectId).join(',') ?? ''
  const docs = useMondayDocs(docsKey, connected && tab === 'docs')
  const { ensureLoaded } = calendar
  const holidaysByDate = useTaiwanHolidays(
    connected && tab === 'calendar' && status?.showTaiwanHolidays !== false
  )

  useEffect(() => {
    if (connected && tab === 'calendar') {
      ensureLoaded()
    }
  }, [connected, ensureLoaded, tab])

  const people = useMemo(() => listMondayPeopleWithItems(snapshot), [snapshot])
  const peopleById = useMemo(
    () => new Map((snapshot?.people ?? []).map((person) => [person.id, person.name])),
    [snapshot]
  )
  const boards = snapshot?.boards ?? []
  const boardSettings = status?.boardSettings ?? EMPTY_BOARD_SETTINGS
  const selectedBoardIds = effectiveBoardSelection(status?.selectedBoardIds ?? null, boards)
  const boardKey = selectedBoardIds?.join(',') ?? ''
  const items = useMemo(
    () =>
      filterMondayItems(snapshot?.items ?? [], {
        selectedPersonIds,
        selectedBoardIds: boardKey ? boardKey.split(',') : null,
        boardSettings,
        showDone,
        today
      }),
    [boardKey, boardSettings, selectedPersonIds, showDone, snapshot, today]
  )

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground md:pt-6">
      <header
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-3 pb-3 md:px-5"
        // Why: no stacked center titlebar on this page; keep the controls clear of Windows/Linux window controls.
        style={{ paddingRight: 'max(0.75rem, var(--window-controls-width, 0px))' }}
      >
        <h1 className="truncate text-base font-semibold leading-8">
          {translate('auto.components.sidebar.SidebarNav.monday', 'Monday')}
        </h1>
        {connected ? (
          <MondayPageTabs
            value={tab}
            onChange={(next) => calendar.updatePreferences({ activeTab: next })}
          />
        ) : null}
        {connected && tab === 'docs' ? (
          <MondayDocsToolbar docs={docs} onOpenSettings={() => setSettingsOpen(true)} />
        ) : null}
        {connected && tab === 'calendar' ? (
          <MondayCalendarToolbar
            cursor={cursor}
            onCursorChange={setCursor}
            boards={boards}
            selectedBoardIds={selectedBoardIds}
            onSelectedBoardIdsChange={(next) =>
              calendar.updatePreferences({ selectedBoardIds: next })
            }
            people={people}
            selectedPersonIds={selectedPersonIds}
            onSelectedPersonIdsChange={(next) =>
              calendar.updatePreferences({ selectedPersonIds: next })
            }
            showDone={showDone}
            onShowDoneChange={(next) => calendar.updatePreferences({ showDone: next })}
            loading={calendar.loading}
            fetchedAt={snapshot?.fetchedAt ?? null}
            onRefresh={calendar.refresh}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : null}
      </header>
      {calendar.error && tab === 'calendar' && (connected || status === null) ? (
        <MondayErrorBanner
          error={calendar.error}
          onRetry={calendar.refresh}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : null}
      {status === null ? null : !connected ? (
        <MondayConnectPanel
          initialReferences={connectionReferenceLines(status)}
          onConnected={calendar.applyConnectedStatus}
        />
      ) : tab === 'docs' ? (
        <MondayDocsView docs={docs} onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <MondayCalendarWorkspace
          cursor={cursor}
          items={items}
          holidaysByDate={holidaysByDate}
          peopleById={peopleById}
          selectedPersonIds={selectedPersonIds}
          undatedExpanded={status.undatedExpanded}
          onUndatedExpandedChange={(next) => calendar.updatePreferences({ undatedExpanded: next })}
        />
      )}
      {status && connected ? (
        <MondaySettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          status={status}
          onConnected={calendar.applyConnectedStatus}
          onDisconnect={calendar.disconnect}
          boards={boards}
          onBoardSettingsChange={(next) => calendar.updatePreferences({ boardSettings: next })}
          onShowTaiwanHolidaysChange={(next) =>
            calendar.updatePreferences({ showTaiwanHolidays: next })
          }
        />
      ) : null}
    </main>
  )
}
