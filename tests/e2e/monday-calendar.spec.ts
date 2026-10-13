import type { ElectronApplication } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import type {
  MondayCalendarSnapshot,
  MondayConnectionStatus,
  MondayDocSummary,
  MondayUpdate
} from '../../src/shared/monday-calendar-types'
import type { TaiwanCalendarDay } from '../../src/shared/taiwan-holiday-types'

function isoDay(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function calendarItem(
  id: string,
  name: string,
  ownerIds: string[],
  endOffset: number | null,
  status: { label: string; color: string; isDone?: boolean },
  parentItemName: string | null = null
): MondayCalendarSnapshot['items'][number] {
  return {
    id,
    name,
    url: `https://example.monday.com/boards/1/pulses/${id}`,
    boardId: '1',
    boardName: 'Project Cases',
    groupId: 'october',
    groupTitle: 'October maintenance',
    parentItemName,
    ownerIds,
    // Why: every dated item starts today so the default month view always contains it.
    startDate: endOffset === null ? null : isoDay(0),
    endDate: endOffset === null ? null : isoDay(endOffset),
    statusLabel: status.label,
    statusColor: status.color,
    isDone: status.isDone === true
  }
}

const SNAPSHOT: MondayCalendarSnapshot = {
  fetchedAt: Date.now(),
  people: [
    { id: '50798552', name: 'Jater' },
    { id: '28766460', name: 'Heather' },
    { id: '69175796', name: 'Omar' }
  ],
  boards: [
    { id: '1', name: 'Project Cases', groups: [{ id: 'october', title: 'October maintenance' }] },
    {
      id: '2',
      name: "Jater's Task",
      groups: [
        { id: 'this_week', title: 'This Week' },
        { id: 'completed', title: 'Completed' }
      ]
    }
  ],
  items: [
    calendarItem('1', 'Checkout redesign', ['28766460', '50798552'], 3, {
      label: 'In Progress',
      color: '#fdab3d'
    }),
    calendarItem('2', 'API integration', ['50798552'], 0, {
      label: 'Dev Review',
      color: '#66ccff'
    }),
    calendarItem('3', 'SEO audit', ['69175796'], 1, { label: 'Testing', color: '#bda8f9' }),
    calendarItem('4', 'Old done task', ['50798552'], 0, {
      label: 'Done',
      color: '#00c875',
      isDone: true
    }),
    calendarItem(
      '5',
      'UI color tweaks',
      ['50798552'],
      0,
      { label: 'Working on it', color: '#fdab3d' },
      'Website revamp'
    ),
    calendarItem('6', 'Write release notes', ['50798552'], null, {
      label: 'Pending',
      color: '#9aadbd'
    }),
    {
      ...calendarItem('9', 'Weekly report', ['28766460'], 0, {
        label: 'Done',
        color: '#00c875',
        isDone: true
      }),
      boardId: '2',
      boardName: "Jater's Task",
      groupId: 'completed',
      groupTitle: 'Completed'
    },
    {
      ...calendarItem('8', 'Kickoff call', ['50798552'], 1, { label: '', color: '' }),
      statusLabel: null,
      statusColor: null
    },
    {
      ...calendarItem('7', 'Daily log', ['50798552'], 0, {
        label: 'Working on it',
        color: '#fdab3d'
      }),
      boardId: '2',
      boardName: "Jater's Task",
      groupId: 'this_week',
      groupTitle: 'This Week'
    }
  ]
}

const UPDATES: MondayUpdate[] = [
  {
    id: '100',
    authorName: 'Niki',
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    bodyHtml:
      '<p>Customers report the search misses some products.<br>Please fix every admin search box.</p><ol><li>Products</li><li>Articles</li></ol><script>window.__mondayXss = true</script>',
    attachments: [{ id: '7', name: 'spec.pdf', url: 'https://example.com/spec.pdf' }],
    replies: [
      {
        id: '101',
        authorName: 'Omar',
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        bodyHtml:
          '<p><a href="https://example.monday.com/users/1">@Niki</a> Fixed, waiting for release.</p>',
        attachments: []
      }
    ]
  }
]

function saturdayThisMonthOtherThanToday(): string {
  const today = new Date()
  for (let day = 1; day <= 28; day += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), day)
    if (date.getDay() === 6 && day !== today.getDate()) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  throw new Error('no Saturday found')
}

const HOLIDAYS: TaiwanCalendarDay[] = [
  { date: isoDay(0), name: '國慶日', kind: 'holiday' },
  { date: saturdayThisMonthOtherThanToday(), name: null, kind: 'makeup-workday' }
]

const DOCS: MondayDocSummary[] = [
  {
    id: '42',
    objectId: '100',
    url: 'https://example.monday.com/docs/100',
    name: 'Project notes',
    updatedAt: new Date().toISOString()
  }
]

const DOC_MARKDOWN = [
  '# Staging site',
  '',
  'Front end: [staging.example.com](https://staging.example.com)',
  '',
  '| Service | Test | Production |',
  '| --- | --- | --- |',
  '| Login | sandbox | live |'
].join('\n')

async function stubMondayIpc(
  electronApp: ElectronApplication,
  status: MondayConnectionStatus,
  snapshot: MondayCalendarSnapshot,
  updates: MondayUpdate[] = []
): Promise<void> {
  // Why: the spec must never reach monday.com; replace the main-process handlers with fixtures.
  await electronApp.evaluate(
    ({ ipcMain }, fixture) => {
      for (const channel of [
        'monday:status',
        'monday:fetchCalendar',
        'monday:fetchItemUpdates',
        'monday:fetchDocs',
        'monday:fetchDocContent',
        'monday:fetchTaiwanHolidays',
        'monday:updatePreferences'
      ]) {
        ipcMain.removeHandler(channel)
      }
      ipcMain.handle('monday:status', () => fixture.status)
      ipcMain.handle('monday:fetchCalendar', () => ({ ok: true, snapshot: fixture.snapshot }))
      ipcMain.handle('monday:fetchItemUpdates', () => ({ ok: true, updates: fixture.updates }))
      ipcMain.handle('monday:fetchDocs', () => ({ ok: true, docs: fixture.docs }))
      ipcMain.handle('monday:fetchDocContent', () => ({ ok: true, markdown: fixture.markdown }))
      ipcMain.handle('monday:fetchTaiwanHolidays', () => ({
        ok: true,
        days: fixture.holidays,
        fetchedAt: 0
      }))
      ipcMain.handle('monday:updatePreferences', () => undefined)
    },
    { status, snapshot, updates, docs: DOCS, markdown: DOC_MARKDOWN, holidays: HOLIDAYS }
  )
}

const CONNECTED: MondayConnectionStatus = {
  connected: true,
  connectedAs: 'Heather',
  boardIds: ['1'],
  docs: [{ objectId: '100', url: 'https://example.monday.com/docs/100' }],
  activeTab: 'calendar',
  showTaiwanHolidays: true,
  selectedPersonIds: null,
  selectedBoardIds: null,
  // Why: mirrors the weekly-report board setup — everyone, done included, last two weeks.
  boardSettings: {
    '2': { groupId: null, ignorePeopleFilter: true, includeDone: true, recentWeeks: 2 }
  },
  showDone: false,
  undatedExpanded: false
}

test('Monday calendar filters tasks and opens a read-only detail panel', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'en' }))
  await stubMondayIpc(electronApp, CONNECTED, SNAPSHOT, UPDATES)

  await orcaPage.getByRole('button', { name: 'Monday', exact: true }).click()
  const main = orcaPage
    .locator('main')
    .filter({ has: orcaPage.getByRole('heading', { name: 'Monday' }) })
  await expect(main.getByRole('button', { name: /Checkout redesign/ }).first()).toBeVisible({
    timeout: 10_000
  })
  await expect(main.getByRole('button', { name: /SEO audit/ })).toBeVisible()
  await expect(main.getByRole('button', { name: /Old done task/ })).toHaveCount(0)
  // Taiwan government calendar: a named day off and a Saturday make-up workday.
  await expect(main.getByText('國慶日', { exact: true })).toBeVisible()
  await expect(main.getByText('Make-up workday', { exact: true })).toBeVisible()
  await expect(main.getByRole('button', { name: /Weekly report/ })).toBeVisible()

  await main.getByRole('switch', { name: 'Show done' }).click()
  await expect(main.getByRole('button', { name: /Old done task/ })).toBeVisible()

  await main.getByRole('combobox', { name: 'People' }).click()
  await orcaPage.getByRole('option', { name: 'Jater' }).click()
  // Why: once someone is picked, everyone else folds under "Other people".
  await expect(orcaPage.getByRole('option', { name: 'Heather' })).toHaveCount(0)
  await orcaPage.getByRole('option', { name: /Other people/ }).click()
  await expect(orcaPage.getByRole('option', { name: 'Heather' })).toBeVisible()
  await orcaPage.keyboard.press('Escape')
  await expect(main.getByRole('button', { name: /SEO audit/ })).toHaveCount(0)
  await expect(main.getByRole('button', { name: /Weekly report/ })).toBeVisible()

  await main.getByRole('button', { name: 'Monday settings' }).click()
  const settings = orcaPage.getByRole('dialog', { name: 'Monday settings' })
  await expect(settings.getByText('Board display')).toBeVisible()
  await expect(settings.getByText('Always show done tasks on this board').first()).toBeVisible()
  await orcaPage.keyboard.press('Escape')
  await expect(settings).toHaveCount(0)

  await expect(main.getByRole('button', { name: /Daily log/ })).toBeVisible()
  await main.getByRole('combobox', { name: 'Boards' }).click()
  const casesOption = orcaPage.getByRole('option', { name: 'Project Cases' })
  const weeklyOption = orcaPage.getByRole('option', { name: "Jater's Task" })
  // Why: "All boards" shows every board checked, so unchecking one keeps the rest.
  await expect(casesOption).toHaveAttribute('data-checked', 'true')
  await expect(weeklyOption).toHaveAttribute('data-checked', 'true')
  await weeklyOption.click()
  await expect(weeklyOption).toHaveAttribute('data-checked', 'false')
  await expect(casesOption).toHaveAttribute('data-checked', 'true')
  await expect(casesOption).toHaveAttribute('data-disabled', 'true')
  await expect(main.getByRole('button', { name: /Daily log/ })).toHaveCount(0)
  await expect(main.getByRole('button', { name: /API integration/ })).toBeVisible()
  await weeklyOption.click()
  await expect(weeklyOption).toHaveAttribute('data-checked', 'true')
  await expect(casesOption).toHaveAttribute('data-checked', 'true')
  await orcaPage.keyboard.press('Escape')
  await expect(main.getByRole('combobox', { name: 'Boards' })).toHaveText(/All boards/)
  await expect(main.getByRole('button', { name: /Daily log/ })).toBeVisible()

  const undatedToggle = main.getByRole('button', { name: /No date/ })
  await expect(undatedToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(main.getByRole('button', { name: /Write release notes/ })).toHaveCount(0)
  await undatedToggle.click()
  await main.getByRole('button', { name: /Write release notes/ }).click()
  const undatedPanel = main.getByRole('complementary', { name: 'Write release notes' })
  await expect(undatedPanel.getByText('No date', { exact: true })).toBeVisible()

  await main.getByRole('button', { name: /UI color tweaks/ }).click()
  const panel = main.getByRole('complementary', { name: 'UI color tweaks' })
  await expect(panel.getByText('Subitem of Website revamp')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Open in Monday' })).toBeVisible()
  await expect(panel.getByText('Please fix every admin search box.')).toBeVisible()
  await expect(panel.getByText('Fixed, waiting for release.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'spec.pdf' })).toBeVisible()
  expect(await orcaPage.evaluate(() => 'mondayXss' in window || '__mondayXss' in window)).toBe(
    false
  )

  await orcaPage.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'zh-TW' }))
  await main
    .getByRole('button', { name: /Checkout redesign/ })
    .first()
    .click()
  await expect(main.getByRole('button', { name: '在 Monday 中開啟' })).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('monday-calendar-zh-TW-panel.png') })
  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ theme: 'dark' }))
  await expect(orcaPage.locator('html.dark')).toHaveCount(1)
  await orcaPage.screenshot({ path: testInfo.outputPath('monday-calendar-zh-TW-dark.png') })
})

test('Monday docs tab shows a subscribed doc read-only', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'en' }))
  await stubMondayIpc(electronApp, CONNECTED, SNAPSHOT)

  await orcaPage.getByRole('button', { name: 'Monday', exact: true }).click()
  await orcaPage.getByRole('tab', { name: 'Docs' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Project notes' })).toBeVisible({
    timeout: 10_000
  })
  await expect(orcaPage.getByRole('heading', { name: 'Staging site' })).toBeVisible()
  await expect(orcaPage.getByRole('cell', { name: 'sandbox' })).toBeVisible()
  await expect(orcaPage.getByRole('link', { name: 'staging.example.com' })).toBeVisible()
  // Why: the docs tab replaces the calendar toolbar, so calendar filters are not on screen.
  await expect(orcaPage.getByRole('combobox', { name: 'People' })).toHaveCount(0)

  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'zh-TW' }))
  await expect(orcaPage.getByRole('tab', { name: '文件' })).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('monday-docs-zh-TW.png') })
})

test('Monday page asks for a token and board before connecting', async ({
  electronApp,
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'en' }))
  await stubMondayIpc(
    electronApp,
    { ...CONNECTED, connected: false, connectedAs: null, boardIds: [], docs: [] },
    SNAPSHOT
  )

  await orcaPage.getByRole('button', { name: 'Monday', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Connect Monday' })).toBeVisible({
    timeout: 10_000
  })
  await orcaPage.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(orcaPage.getByText('Enter at least one board or doc URL.')).toBeVisible()
  await orcaPage
    .getByRole('textbox', { name: 'Boards and docs' })
    .fill('https://example.monday.com/workspaces/1')
  await orcaPage.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(
    orcaPage.getByText('Not a monday board or doc URL: https://example.monday.com/workspaces/1')
  ).toBeVisible()
})
