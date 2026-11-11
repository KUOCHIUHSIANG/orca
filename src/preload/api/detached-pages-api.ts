import type {
  DetachedPage,
  DetachedPagesBroadcastTopic,
  MainWindowCall,
  MainWindowCallRequest,
  MainWindowCallResult,
  MondayBrowserAction,
  MondayBrowserState,
  MondayTaskSelection
} from '../../shared/detached-pages'

export type DetachedPagesApi = {
  list: () => Promise<DetachedPage[]>
  open: (page: DetachedPage) => Promise<void>
  /** Closes the page's window; the main window shows the page again. */
  dock: (page: DetachedPage) => Promise<void>
  /** Main window only: reopens the windows that were open when Orca last quit. */
  restore: () => Promise<void>
  onChanged: (callback: (open: DetachedPage[]) => void) => () => void
  /** Main window only: a page was moved back and should be shown. */
  onDocked: (callback: (page: DetachedPage) => void) => () => void
  showMondayTask: (selection: MondayTaskSelection, options: { open: boolean }) => Promise<void>
  /** Task window only: the monday.com page under its toolbar. */
  mondayBrowserState: () => Promise<MondayBrowserState | null>
  onMondayBrowserState: (callback: (state: MondayBrowserState) => void) => () => void
  mondayBrowser: (action: MondayBrowserAction) => Promise<void>
  onMondayTaskClosed: (callback: (event: { keepItemId: string | null }) => void) => () => void
  callMainWindow: <C extends MainWindowCall>(call: C) => Promise<MainWindowCallResult[C['action']]>
  /** Main window only: answers calls from detached windows. */
  onMainWindowCall: (callback: (request: MainWindowCallRequest) => void) => () => void
  replyMainWindowCall: (
    reply: { requestId: string } & ({ ok: true; value: unknown } | { ok: false; error: string })
  ) => void
  broadcast: (topic: DetachedPagesBroadcastTopic, payload: unknown) => Promise<void>
  onBroadcast: (
    callback: (message: { topic: DetachedPagesBroadcastTopic; payload: unknown }) => void
  ) => () => void
}
