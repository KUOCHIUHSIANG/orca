// Real-store coverage: runs land in the docked bottom-panel group without moving other groups or focus.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import type { TabGroupLayoutNode } from '../../../shared/tab-types'
import type { RunConfiguration } from '../../../shared/run-configuration-types'
import { createTestStore, makeWorktree, seedStore } from '../store/slices/store-test-helpers'
import { createStoreCascadesMockApi } from '../store/slices/store-cascades-test-harness'
import { findDockedGroupId } from '../store/slices/tabs/tab-group-dock'
import { useBottomPanelState } from './bottom-panel-state'
import { findTopRightGroupId } from './run-configuration-panel'
import {
  rerunConfigurationInTab,
  restartRunTab,
  runConfigurationInNewTab
} from './run-configuration-in-new-tab'

const storeBox = vi.hoisted(() => {
  const box: { store: unknown } = { store: null }
  return box
})

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() }
}))

vi.mock('@/store', () => ({
  get useAppStore() {
    return storeBox.store
  }
}))

createStoreCascadesMockApi()

const WT = 'repo1::/path/wt1'
const DEV: RunConfiguration = {
  id: 'npm:dev',
  label: 'npm run dev',
  command: 'npm run dev',
  type: 'npm',
  projectPath: '/path/wt1/package.json',
  isAutoDetected: true
}

function seedWorktreeWithTerminal(): {
  store: ReturnType<typeof createTestStore>
  terminalGroupId: string
} {
  const store = createTestStore()
  storeBox.store = store
  seedStore(store, {
    settings: getDefaultSettings('/tmp'),
    worktreesByRepo: {
      repo1: [makeWorktree({ id: WT, repoId: 'repo1', path: '/path/wt1' })]
    },
    activeWorktreeId: WT
  })
  store.getState().createTab(WT)
  return { store, terminalGroupId: store.getState().activeGroupIdByWorktree[WT] }
}

function dockedGroupId(store: ReturnType<typeof createTestStore>): string | null {
  return findDockedGroupId(store.getState().groupsByWorktree[WT] ?? [])
}

describe('findTopRightGroupId', () => {
  it('picks the right column of the top row', () => {
    const layout: TabGroupLayoutNode = {
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', groupId: 'g-left' },
      second: {
        type: 'split',
        direction: 'vertical',
        first: { type: 'leaf', groupId: 'g-right-top' },
        second: { type: 'leaf', groupId: 'g-right-bottom' }
      }
    }
    expect(findTopRightGroupId(layout)).toBe('g-right-top')
    expect(findTopRightGroupId({ type: 'leaf', groupId: 'g-only' })).toBe('g-only')
  })
})

describe('run panel placement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBottomPanelState.getState().setOpen(false)
  })

  it('opens the first run in a docked group, opens the panel, and keeps focus', () => {
    const { store, terminalGroupId } = seedWorktreeWithTerminal()
    store.getState().createEmptySplitGroup(WT, terminalGroupId, 'right', { activate: false })
    const splitLayout = store.getState().layoutByWorktree[WT]

    const launched = runConfigurationInNewTab({ config: DEV, worktreeId: WT })

    const state = store.getState()
    const runGroupId = dockedGroupId(store)
    expect(state.groupsByWorktree[WT].find((g) => g.id === runGroupId)?.tabOrder).toEqual([
      launched?.tabId
    ])
    // The split layout is kept intact; the docked group only wraps it.
    expect(state.layoutByWorktree[WT]).toMatchObject({ type: 'split', first: splitLayout })
    expect(state.activeGroupIdByWorktree[WT]).toBe(terminalGroupId)
    expect(useBottomPanelState.getState().open).toBe(true)
  })

  it('reuses the docked group for later runs', () => {
    const { store } = seedWorktreeWithTerminal()
    const first = runConfigurationInNewTab({ config: DEV, worktreeId: WT })
    const runGroupId = dockedGroupId(store)

    const second = runConfigurationInNewTab({
      config: { ...DEV, id: 'npm:build', label: 'npm run build', command: 'npm run build' },
      worktreeId: WT
    })

    const groups = store.getState().groupsByWorktree[WT]
    expect(groups.filter((g) => g.dock === 'bottom')).toHaveLength(1)
    expect(groups.find((g) => g.id === runGroupId)?.tabOrder).toEqual([first?.tabId, second?.tabId])
  })

  it('moves an older run tab into the docked group when it is rerun', () => {
    const { store, terminalGroupId } = seedWorktreeWithTerminal()
    const legacyRun = store.getState().createTab(WT, terminalGroupId, undefined, {
      quickCommandLabel: DEV.label
    })
    store.setState({
      ptyIdsByTabId: { ...store.getState().ptyIdsByTabId, [legacyRun.id]: ['pty-1'] }
    })
    const write = vi.fn()
    Object.assign(window.api.pty, { write })

    expect(rerunConfigurationInTab({ config: DEV, tabId: legacyRun.id, worktreeId: WT })).toBe(true)

    const state = store.getState()
    const movedTab = state.unifiedTabsByWorktree[WT].find((t) => t.entityId === legacyRun.id)
    expect(movedTab?.groupId).toBe(dockedGroupId(store))
    expect(state.activeGroupIdByWorktree[WT]).toBe(terminalGroupId)
    expect(write).toHaveBeenCalledWith('pty-1', 'npm run dev\r', 'launch')
  })
})

describe('restartRunTab', () => {
  function seedRunningTab(): { tabId: string; write: ReturnType<typeof vi.fn> } {
    const { store } = seedWorktreeWithTerminal()
    const launched = runConfigurationInNewTab({ config: DEV, worktreeId: WT })!
    store.setState({
      ptyIdsByTabId: { ...store.getState().ptyIdsByTabId, [launched.tabId]: ['pty-1'] }
    })
    const write = vi.fn()
    Object.assign(window.api.pty, { write })
    return { tabId: launched.tabId, write }
  }

  it('waits for the service to exit before typing the command again', async () => {
    const { tabId, write } = seedRunningTab()
    const hasChildProcesses = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false)
    Object.assign(window.api.pty, { hasChildProcesses })

    expect(await restartRunTab({ config: DEV, tabId, worktreeId: WT })).toBe(true)

    expect(hasChildProcesses).toHaveBeenCalledTimes(3)
    expect(write.mock.calls).toEqual([
      ['pty-1', '\x03', 'driving'],
      ['pty-1', 'npm run dev\r', 'launch']
    ])
  })

  it('gives up without typing when the service ignores Ctrl+C', async () => {
    vi.useFakeTimers()
    try {
      const { tabId, write } = seedRunningTab()
      Object.assign(window.api.pty, { hasChildProcesses: vi.fn().mockResolvedValue(true) })

      const restarted = restartRunTab({ config: DEV, tabId, worktreeId: WT })
      await vi.advanceTimersByTimeAsync(11_000)

      expect(await restarted).toBe(false)
      expect(write.mock.calls).toEqual([['pty-1', '\x03', 'driving']])
    } finally {
      vi.useRealTimers()
    }
  })
})
