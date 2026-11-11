import type { MondayCalendarItem } from './monday-calendar-types'

/** Fork pages that can move into their own window, e.g. onto a second monitor. */
export const DETACHED_PAGES = ['monday', 'todo', 'servers', 'monday-task'] as const

export type DetachedPage = (typeof DETACHED_PAGES)[number]

/** Narrows untrusted IPC payloads without casts. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDetachedPage(value: unknown): value is DetachedPage {
  return DETACHED_PAGES.some((page) => page === value)
}

/** The task the Monday task window shows; the calendar that picked it sends it along. */
export type MondayTaskSelection = {
  item: MondayCalendarItem
  ownerNames: string[]
}

export function isMondayTaskSelection(value: unknown): value is MondayTaskSelection {
  if (!isRecord(value) || !isRecord(value.item) || !Array.isArray(value.ownerNames)) {
    return false
  }
  const { item, ownerNames } = value
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.url === 'string' &&
    ownerNames.every((name) => typeof name === 'string')
  )
}

/** What the Monday task window's toolbar shows about the monday.com page beneath it. */
export type MondayBrowserState = {
  url: string | null
  title: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
}

export const MONDAY_BROWSER_ACTIONS = ['back', 'forward', 'reload', 'stop', 'openExternal'] as const

export type MondayBrowserAction = (typeof MONDAY_BROWSER_ACTIONS)[number]

export function isMondayBrowserAction(value: unknown): value is MondayBrowserAction {
  return MONDAY_BROWSER_ACTIONS.some((action) => action === value)
}

export type DetachedWorkspaceGroup = {
  id: string
  /** null labels the folder workspaces group. */
  repoName: string | null
  workspaces: { id: string; displayName: string }[]
}

export type DetachedServerTerminalTab = { tabId: string; title: string }

/** Work only the main window can do: its store owns projects, tabs and the floating terminal. */
export type MainWindowCall =
  | { action: 'workspaceGroups' }
  | { action: 'openPromptInClaude'; workspaceId: string; prompt: string }
  | {
      action: 'openServerTerminal'
      serverId: string
      cwd: string
      prefill?: { command: string }
    }
  | { action: 'serverTerminalTabs'; serverId: string }
  | { action: 'typeIntoServerTerminal'; tabId: string; text: string }

export type MainWindowCallResult = {
  workspaceGroups: DetachedWorkspaceGroup[]
  openPromptInClaude: null
  openServerTerminal: boolean
  serverTerminalTabs: DetachedServerTerminalTab[]
  typeIntoServerTerminal: boolean
}

export type MainWindowCallAction = MainWindowCall['action']

export type MainWindowCallRequest = { requestId: string; call: MainWindowCall }

/** Calls that put a tab, terminal or their error toast in the main window, so it comes forward. */
export const MAIN_WINDOW_REVEALING_CALLS: ReadonlySet<MainWindowCallAction> = new Set([
  'openPromptInClaude',
  'openServerTerminal',
  'typeIntoServerTerminal'
])

export function isMainWindowCall(value: unknown): value is MainWindowCall {
  if (!isRecord(value)) {
    return false
  }
  switch (value.action) {
    case 'workspaceGroups':
      return true
    case 'openPromptInClaude':
      return typeof value.workspaceId === 'string' && typeof value.prompt === 'string'
    case 'openServerTerminal':
      return (
        typeof value.serverId === 'string' &&
        typeof value.cwd === 'string' &&
        (value.prefill === undefined ||
          (isRecord(value.prefill) && typeof value.prefill.command === 'string'))
      )
    case 'serverTerminalTabs':
      return typeof value.serverId === 'string'
    case 'typeIntoServerTerminal':
      return typeof value.tabId === 'string' && typeof value.text === 'string'
    default:
      return false
  }
}

/** Events every Orca window applies, so views of the same data stay in step across windows. */
export const DETACHED_PAGES_BROADCAST_TOPICS = ['todo-task'] as const

export type DetachedPagesBroadcastTopic = (typeof DETACHED_PAGES_BROADCAST_TOPICS)[number]

export function isDetachedPagesBroadcastTopic(
  value: unknown
): value is DetachedPagesBroadcastTopic {
  return DETACHED_PAGES_BROADCAST_TOPICS.some((topic) => topic === value)
}
