import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import type { MicrosoftTodoStatus, MicrosoftTodoTask } from '../../src/shared/microsoft-todo-types'

function isoDay(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todoTask(id: string, extra: Partial<MicrosoftTodoTask> = {}): MicrosoftTodoTask {
  return {
    id,
    listId: 'tasks',
    title: id,
    completed: false,
    important: false,
    dueDate: null,
    completedAt: null,
    createdAt: null,
    notes: null,
    reminderAt: null,
    webUrl: `https://to-do.live.com/tasks/id/${id}/details`,
    ...extra
  }
}

const SIGNED_IN: MicrosoftTodoStatus = {
  clientIdConfigured: true,
  signedIn: true,
  accountName: 'jater@outlook.com',
  selectedListId: null
}

const TASKS = [
  todoTask('Renew domain', { dueDate: isoDay(-2) }),
  todoTask('Weekly report', { dueDate: isoDay(0), important: true }),
  todoTask('Buy milk', { notes: 'Oat milk, two cartons' }),
  todoTask('Book dentist', { completed: true, completedAt: new Date().toISOString() })
]

async function stubTodoIpc(
  electronApp: ElectronApplication,
  status: MicrosoftTodoStatus
): Promise<void> {
  // Why: the spec must never reach Microsoft; replace the main-process handlers with fixtures.
  await electronApp.evaluate(
    ({ ipcMain }, fixture) => {
      const tasks = [...fixture.tasks]
      for (const channel of [
        'todo:status',
        'todo:setClientId',
        'todo:fetchLists',
        'todo:fetchTasks',
        'todo:createTask',
        'todo:setTaskCompleted',
        'todo:fetchChecklist',
        'todo:updateTask',
        'todo:deleteTask',
        'todo:setChecklistItemChecked',
        'todo:deleteChecklistItem',
        'todo:selectList'
      ]) {
        ipcMain.removeHandler(channel)
      }
      ipcMain.handle('todo:status', () => fixture.status)
      ipcMain.handle('todo:setClientId', () => ({
        ok: false,
        kind: 'not-configured',
        message: 'invalid-client-id'
      }))
      ipcMain.handle('todo:fetchLists', () => ({
        ok: true,
        lists: [
          { id: 'tasks', name: 'Tasks', wellKnownName: 'defaultList' },
          { id: 'work', name: 'Work', wellKnownName: 'none' }
        ]
      }))
      ipcMain.handle('todo:fetchTasks', () => ({ ok: true, tasks }))
      ipcMain.handle(
        'todo:createTask',
        (_event, args: { title: string; dueDate: string | null }) => {
          const task = {
            ...fixture.template,
            id: args.title,
            title: args.title,
            dueDate: args.dueDate
          }
          tasks.unshift(task)
          return { ok: true, task }
        }
      )
      ipcMain.handle(
        'todo:setTaskCompleted',
        (_event, args: { taskId: string; completed: boolean }) => {
          const task = tasks.find((entry) => entry.id === args.taskId)
          return {
            ok: true,
            task: { ...task, completed: args.completed, completedAt: new Date().toISOString() }
          }
        }
      )
      ipcMain.handle('todo:fetchChecklist', () => ({
        ok: true,
        items: [
          { id: 's1', title: 'Check the fridge', checked: true },
          { id: 's2', title: 'Go to the store', checked: false }
        ]
      }))
      ipcMain.handle(
        'todo:updateTask',
        (_event, args: { taskId: string; changes: Record<string, unknown> }) => {
          const index = tasks.findIndex((entry) => entry.id === args.taskId)
          const { important, ...rest } = args.changes
          tasks[index] = {
            ...tasks[index],
            ...rest,
            ...(typeof important === 'boolean' ? { important } : {})
          }
          return { ok: true, task: tasks[index] }
        }
      )
      Reflect.set(globalThis, '__todoDeleteCalls', 0)
      ipcMain.handle('todo:deleteTask', () => {
        Reflect.set(
          globalThis,
          '__todoDeleteCalls',
          Number(Reflect.get(globalThis, '__todoDeleteCalls')) + 1
        )
        return { ok: true }
      })
      ipcMain.handle(
        'todo:setChecklistItemChecked',
        (_event, args: { itemId: string; checked: boolean }) => ({
          ok: true,
          item: { id: args.itemId, title: args.itemId, checked: args.checked }
        })
      )
      ipcMain.handle('todo:deleteChecklistItem', () => ({ ok: true }))
      ipcMain.handle('todo:selectList', () => undefined)
    },
    { status, tasks: TASKS, template: todoTask('template') }
  )
}

async function openTodoPanel(page: Page): Promise<void> {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  // Why: the host OS locale drives the default UI language; pin English for stable locators.
  await page.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'en' }))
  await page.evaluate(() => {
    const state = window.__store!.getState()
    state.setRightSidebarTab('todos')
    state.setRightSidebarOpen(true)
  })
}

async function waitForTodoAnimations(page: Page): Promise<void> {
  // Why: hidden test windows run CSS animations slowly; capture the settled layout, not a frame.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[data-slot="collapsible-content"]')).every((element) =>
      element.getAnimations().every((animation) => animation.playState !== 'running')
    )
  )
}

test('To Do panel groups tasks, completes them, and adds new ones', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  await stubTodoIpc(electronApp, SIGNED_IN)
  await openTodoPanel(orcaPage)

  await expect(orcaPage.getByText('jater@outlook.com')).toBeVisible({ timeout: 10_000 })
  await expect(orcaPage.getByText('Overdue · 1')).toBeVisible()
  await expect(orcaPage.getByText('Today · 1')).toBeVisible()
  await expect(orcaPage.getByText('No due date · 1')).toBeVisible()
  await expect(orcaPage.getByText('Completed · 1')).toBeVisible()
  // The To Do tab took over the Checks slot in the activity bar.
  await expect(orcaPage.getByRole('button', { name: 'To Do', exact: true })).toBeVisible()

  // A ticked task stays put, struck through, before it folds into Completed.
  await orcaPage.getByRole('checkbox', { name: 'Mark as completed' }).first().click()
  await expect(
    orcaPage.locator('[data-todo-title][data-done="true"]', { hasText: 'Renew domain' })
  ).toBeVisible()
  await expect(orcaPage.getByText('Overdue · 1')).toBeVisible()
  await orcaPage.waitForTimeout(350)
  await orcaPage.screenshot({ path: testInfo.outputPath('microsoft-todo-completing.png') })
  await expect(orcaPage.getByText('Overdue · 1')).toHaveCount(0)
  await expect(orcaPage.getByText('Completed · 2')).toBeVisible()

  // Clicking a title expands its details instead of leaving Orca; the chevron tracks it.
  await orcaPage.getByRole('button', { name: 'Buy milk' }).click()
  await expect(orcaPage.getByText('Go to the store')).toBeVisible()
  await expect(orcaPage.getByText('Oat milk, two cartons')).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Hide details' })).toHaveAttribute(
    'aria-expanded',
    'true'
  )
  await expect(
    orcaPage.getByRole('button', { name: 'Open in To Do on the web' }).first()
  ).toBeAttached()
  // Steps can be ticked but not added: Apple Reminders would never show them.
  await expect(orcaPage.getByRole('textbox', { name: 'New step' })).toHaveCount(0)

  // Edits stay a draft until Save, and picking a date keeps the editor open.
  const title = orcaPage.getByRole('textbox', { name: 'Title' })
  const save = orcaPage.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeDisabled()
  await title.fill('Buy oat milk')
  await orcaPage.getByLabel('Due date').last().fill(isoDay(0))
  const important = orcaPage.getByRole('button', { name: 'Important', exact: true })
  await important.click()
  await expect(important).toHaveAttribute('aria-pressed', 'true')
  await expect(orcaPage.getByText('No due date · 1')).toBeVisible()
  await waitForTodoAnimations(orcaPage)
  await orcaPage.screenshot({ path: testInfo.outputPath('microsoft-todo-draft.png') })
  await save.click()
  // The new date moves the row into Today, still expanded and now saved.
  await expect(orcaPage.getByText('Today · 2')).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Buy oat milk' })).toBeVisible()
  await expect(title).toBeVisible()
  await expect(save).toBeDisabled()

  // Collapsing with an unsaved edit saves it instead of dropping it.
  await orcaPage.getByRole('textbox', { name: 'Notes' }).fill('Barista edition')
  await orcaPage.getByRole('button', { name: 'Hide details' }).click()
  await expect(title).toHaveCount(0)
  await orcaPage.getByRole('button', { name: 'Buy oat milk' }).click()
  await expect(orcaPage.getByRole('textbox', { name: 'Notes' })).toHaveValue('Barista edition')

  // Delete hides the task at once, but Undo inside the window brings it back untouched.
  await orcaPage.getByRole('button', { name: 'Delete task' }).click()
  await expect(orcaPage.getByRole('button', { name: 'Buy oat milk' })).toHaveCount(0)
  await orcaPage.getByRole('button', { name: 'Undo' }).click()
  await expect(orcaPage.getByRole('button', { name: 'Buy oat milk' })).toBeVisible()
  expect(await electronApp.evaluate(() => Reflect.get(globalThis, '__todoDeleteCalls'))).toBe(0)

  const newTask = orcaPage.getByRole('textbox', { name: 'New task' })
  await newTask.fill('Call the client')
  await newTask.press('Enter')
  await expect(orcaPage.getByText('Call the client')).toBeVisible()
  await expect(newTask).toHaveValue('')

  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'zh-TW' }))
  await expect(orcaPage.getByText('已完成 · 2')).toBeVisible()
  await orcaPage.getByRole('button', { name: 'Buy oat milk' }).click()
  await expect(orcaPage.getByRole('button', { name: '儲存', exact: true })).toBeVisible()
  await waitForTodoAnimations(orcaPage)
  await orcaPage.screenshot({ path: testInfo.outputPath('microsoft-todo-zh-TW.png') })
})

test('To Do panel asks for an app registration before signing in', async ({
  electronApp,
  orcaPage
}) => {
  await stubTodoIpc(electronApp, {
    clientIdConfigured: false,
    signedIn: false,
    accountName: null,
    selectedListId: null
  })
  await openTodoPanel(orcaPage)

  await expect(orcaPage.getByText('Connect Microsoft To Do')).toBeVisible({ timeout: 10_000 })
  await orcaPage.getByRole('textbox', { name: 'Application (client) ID' }).fill('not-an-id')
  await orcaPage.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    orcaPage.getByText('That does not look like an application ID', { exact: false })
  ).toBeVisible()
})
