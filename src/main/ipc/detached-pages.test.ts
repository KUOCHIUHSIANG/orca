import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DetachedPagesChange } from '../window/detached-page-window'

const { handlers, replyListeners, senders, windowMock, revealMock, browserMock } = vi.hoisted(
  () => {
    const makeSender = (id: number) => ({ id, send: vi.fn(), isDestroyed: () => false })
    const windowState: {
      changeListener: ((change: DetachedPagesChange) => void) | null
      closeDetachedPage: ReturnType<typeof vi.fn>
    } = { changeListener: null, closeDetachedPage: vi.fn() }
    return {
      handlers: new Map<string, (...args: unknown[]) => unknown>(),
      replyListeners: new Set<(...args: unknown[]) => void>(),
      senders: {
        main: makeSender(1),
        servers: makeSender(2),
        task: makeSender(3),
        other: makeSender(4)
      },
      windowMock: windowState,
      revealMock: vi.fn(),
      browserMock: { show: vi.fn(() => true), saveUrl: vi.fn() }
    }
  }
)

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
    on: (_channel: string, listener: (...args: unknown[]) => void) => replyListeners.add(listener),
    removeListener: (_channel: string, listener: (...args: unknown[]) => void) =>
      replyListeners.delete(listener)
  }
}))
vi.mock('./ui', () => ({
  getTrustedUIRendererWebContents: () => senders.main,
  getTrustedUIRendererWindow: () => ({ id: 'main-window' }),
  isTrustedUIRenderer: (sender: unknown) => sender === senders.main
}))
vi.mock('../window/focus-existing-window', () => ({ safelyRevealWindow: revealMock }))
vi.mock('../window/monday-browser-view', () => ({
  mondayBrowserState: vi.fn(),
  runMondayBrowserAction: vi.fn(),
  showMondayBrowserUrl: browserMock.show
}))
vi.mock('../window/detached-page-window-state', () => ({ saveMondayTaskUrl: browserMock.saveUrl }))
vi.mock('../window/detached-page-window', () => ({
  closeDetachedPage: windowMock.closeDetachedPage,
  detachedPageOfRenderer: (sender: unknown) => (sender === senders.task ? 'monday-task' : null),
  installDetachedPagesQuitHandling: () => {},
  isDetachedPageRenderer: (sender: unknown) =>
    sender === senders.servers || sender === senders.task,
  listDetachedPageWindows: () => [{ webContents: senders.servers }, { webContents: senders.task }],
  listOpenDetachedPages: () => ['servers', 'monday-task'],
  onDetachedPagesChanged: (listener: (change: DetachedPagesChange) => void) => {
    windowMock.changeListener = listener
    return () => {}
  },
  openDetachedPage: vi.fn(),
  restoreDetachedPages: vi.fn()
}))

import { registerDetachedPagesHandlers } from './detached-pages'
import { isRecord } from '../../shared/detached-pages'

function invoke(channel: string, sender: unknown, ...args: unknown[]): unknown {
  return handlers.get(channel)!({ sender }, ...args)
}

async function invokeAsync(channel: string, sender: unknown, ...args: unknown[]): Promise<unknown> {
  return invoke(channel, sender, ...args)
}

function reply(sender: unknown, payload: unknown): void {
  for (const listener of replyListeners) {
    listener({ sender }, payload)
  }
}

function lastCallRequest(): { requestId: string; call: unknown } {
  const payload = senders.main.send.mock.calls.findLast(
    ([channel]) => channel === 'detachedPages:mainWindowCall'
  )?.[1]
  if (!isRecord(payload) || typeof payload.requestId !== 'string') {
    throw new Error('No call reached the main window')
  }
  return { requestId: payload.requestId, call: payload.call }
}

describe('detached pages IPC', () => {
  beforeEach(() => {
    handlers.clear()
    replyListeners.clear()
    for (const sender of Object.values(senders)) {
      sender.send.mockClear()
    }
    revealMock.mockClear()
    browserMock.show.mockClear()
    registerDetachedPagesHandlers(null)
  })

  it('runs a detached window call in the main window and answers with only its reply', async () => {
    const call = { action: 'openServerTerminal', serverId: 's1', cwd: '/srv' }
    const pending = invokeAsync('detachedPages:callMainWindow', senders.servers, call)
    const request = lastCallRequest()
    expect(request.call).toEqual(call)

    // Neither another window nor a different request may settle it.
    reply(senders.other, { requestId: request.requestId, ok: true, value: false })
    reply(senders.main, { requestId: 'someone-else', ok: true, value: false })
    reply(senders.main, { requestId: request.requestId, ok: true, value: true })

    await expect(pending).resolves.toBe(true)
    expect(revealMock).toHaveBeenCalledTimes(1)
  })

  it('refuses calls from windows that are not detached pages, and malformed calls', async () => {
    await expect(
      invokeAsync('detachedPages:callMainWindow', senders.other, { action: 'workspaceGroups' })
    ).rejects.toThrow('invalid_main_window_call')
    await expect(
      invokeAsync('detachedPages:callMainWindow', senders.servers, { action: 'openServerTerminal' })
    ).rejects.toThrow('invalid_main_window_call')
    expect(senders.main.send).not.toHaveBeenCalled()
  })

  it('reloads the task page only when the calendar picks a different task', () => {
    const pick = (id: string) => ({
      item: { id, name: 'Report', url: `https://example.monday.com/boards/1/pulses/${id}` },
      ownerNames: []
    })
    invoke('detachedPages:showMondayTask', senders.main, pick('7'), { open: true })
    // The calendar re-sends its pick after each refresh.
    invoke('detachedPages:showMondayTask', senders.main, pick('7'), { open: false })
    invoke('detachedPages:showMondayTask', senders.main, pick('8'), { open: false })

    expect(browserMock.show.mock.calls).toEqual([
      ['https://example.monday.com/boards/1/pulses/7'],
      ['https://example.monday.com/boards/1/pulses/8']
    ])
    expect(browserMock.saveUrl).toHaveBeenLastCalledWith(
      'https://example.monday.com/boards/1/pulses/8'
    )
  })

  it('tells calendars which task came back before the task window leaves the open list', () => {
    const selection = {
      item: { id: 'item-7', name: 'Report', url: 'https://example.monday.com/item-7' },
      ownerNames: ['Jater']
    }
    invoke('detachedPages:showMondayTask', senders.main, selection, { open: false })

    invoke('detachedPages:dock', senders.task, 'monday-task')
    expect(windowMock.closeDetachedPage).toHaveBeenCalledWith('monday-task')
    windowMock.changeListener!({ open: ['servers'], closed: 'monday-task' })

    const channels = senders.main.send.mock.calls.map(([channel]) => channel)
    expect(channels).toEqual(['detachedPages:mondayTaskClosed', 'detachedPages:changed'])
    expect(senders.main.send.mock.calls[0][1]).toEqual({ keepItemId: 'item-7' })
  })
})
