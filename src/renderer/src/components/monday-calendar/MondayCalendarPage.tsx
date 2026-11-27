import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, FileText, LoaderCircle } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { useTranslate } from '@/i18n/use-translate'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import type {
  MondayBoardDisplaySettings,
  MondayPageTab
} from '../../../../shared/monday-calendar-types'
import type { MondayNotification } from '../../../../shared/monday-notification-types'
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
import { MondayNotificationsButton } from './MondayNotificationsButton'
import { MondaySettingsDialog } from './MondaySettingsDialog'
import { useMondayCalendar } from './use-monday-calendar'
import { useMondayItemSelection } from './use-monday-item-selection'
import { useMondayDocs } from './use-monday-docs'
import { useTaiwanHolidays } from '../calendar/use-taiwan-holidays'
import { DetachedPageHeaderAction } from '../detached-pages/DetachedPageHeaderAction'
import { canDetachPages } from '../detached-pages/detached-page-location'

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
  const t = useTranslate()
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

  const { updatePreferences } = calendar
  const expandUndated = useCallback(
    () => updatePreferences({ undatedExpanded: true }),
    [updatePreferences]
  )
  const selection = useMondayItemSelection({
    snapshot,
    filteredItems: items,
    cursor,
    onCursorChange: setCursor,
    today,
    onRevealUndated: expandUndated
  })

  const openNotificationInOrcaBrowser = (notification: MondayNotification): void => {
    if (!canDetachPages()) {
      openAppHttpLink(notification.url)
      return
    }
    // Why: the task window follows the calendar's pick, which would pull it off the comment.
    selection.selectItem(null)
    void window.api.detachedPages.showMondayTask(
      {
        item: { id: notification.itemId, name: notification.itemName ?? '', url: notification.url },
        ownerNames: []
      },
      { open: true }
    )
  }

  // Tasks off the subscribed boards aren't on the calendar, so they open in the Orca browser instead.
  const revealNotification = (notification: MondayNotification): void => {
    if (tab !== 'calendar') {
      updatePreferences({ activeTab: 'calendar' })
    }
    selection.reveal(notification.itemId, () => openNotificationInOrcaBrowser(notification))
  }

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col bg-background pt-4 text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-3 pb-3 md:px-5">
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
        {connected ? (
          <MondayNotificationsButton
            onRevealNotification={revealNotification}
            onOpenInOrcaBrowser={openNotificationInOrcaBrowser}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : null}
        <DetachedPageHeaderAction page="monday" />
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
        <>
          {!snapshot && !calendar.error ? (
            <p className="flex shrink-0 items-center gap-2 px-3 pb-2 text-xs text-muted-foreground md:px-5">
              <LoaderCircle className="size-3.5 animate-spin" />
              {t('auto.components.mondayCalendar.page.loadingTasks', 'Loading monday tasks…')}
            </p>
          ) : null}
          <MondayCalendarWorkspace
            cursor={cursor}
            items={selection.items}
            selectedItemId={selection.selectedItemId}
            onSelectedItemIdChange={selection.selectItem}
            flashingItemId={selection.flashingItemId}
            holidaysByDate={holidaysByDate}
            peopleById={peopleById}
            selectedPersonIds={selectedPersonIds}
            undatedExpanded={status.undatedExpanded}
            onUndatedExpandedChange={(next) =>
              calendar.updatePreferences({ undatedExpanded: next })
            }
          />
        </>
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
          people={snapshot?.people ?? []}
          onNotifyPersonIdChange={(next) => calendar.updatePreferences({ notifyPersonId: next })}
        />
      ) : null}
    </main>
  )
}
