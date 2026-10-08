import { describe, it, expect, vi, beforeEach } from 'vitest'
import type * as AgentStatusModule from '@/lib/agent-status'
import type { Tab, TabGroup, TabGroupLayoutNode } from '../../../../../shared/tab-types'
import { createTabsSliceMockApi } from '../tabs-slice-test-harness'
import { createTestStore } from '../store-test-helpers'
import { findDockedGroupId, pickCenterGroupId, withoutDockedGroups } from './tab-group-dock'
import { workspaceSessionStateSchema } from '../../../../../shared/workspace-session-schema'
import { buildHydratedTabState } from '../tabs-hydration'

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))

vi.mock('@/lib/agent-status', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentStatusModule>()
  return { ...actual, detectAgentStatusFromTitle: vi.fn().mockReturnValue(null) }
})

createTabsSliceMockApi()

const WT = 'repo1::/tmp/feature'

function group(id: string, activeTabId: string | null, dock?: 'bottom'): TabGroup {
  return {
    id,
    worktreeId: WT,
    activeTabId,
    tabOrder: activeTabId ? [activeTabId] : [],
    ...(dock ? { dock } : {})
  }
}

function tab(id: string, groupId: string, lastFocusedAt: number): Tab {
  return {
    id,
    entityId: id,
    groupId,
    worktreeId: WT,
    contentType: 'terminal',
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0,
    lastFocusedAt
  }
}

describe('tab group dock helpers', () => {
  const groups = [
    group('g-left', 't-left'),
    group('g-right', 't-right'),
    group('g-run', 't-run', 'bottom')
  ]

  it('drops docked leaves from the layout and returns null when only they remain', () => {
    const layout: TabGroupLayoutNode = {
      type: 'split',
      direction: 'vertical',
      first: {
        type: 'split',
        direction: 'horizontal',
        first: { type: 'leaf', groupId: 'g-left' },
        second: { type: 'leaf', groupId: 'g-right' }
      },
      second: { type: 'leaf', groupId: 'g-run' }
    }
    expect(withoutDockedGroups(layout, groups)).toEqual(layout.type === 'split' && layout.first)
    expect(withoutDockedGroups({ type: 'leaf', groupId: 'g-run' }, groups)).toBeNull()
  })

  it('prefers the focused split group, else the most recently used one', () => {
    const tabs = [
      tab('t-left', 'g-left', 5),
      tab('t-right', 'g-right', 9),
      tab('t-run', 'g-run', 20)
    ]
    expect(pickCenterGroupId(groups, tabs, 'g-left')).toBe('g-left')
    expect(pickCenterGroupId(groups, tabs, 'g-run')).toBe('g-right')
    expect(pickCenterGroupId([groups[2]], tabs, 'g-run')).toBeNull()
  })
})

describe('new tabs stay out of the bottom panel', () => {
  let store: ReturnType<typeof createTestStore>
  let centerGroupId: string
  let dockedGroupId: string

  beforeEach(() => {
    store = createTestStore()
    store.getState().createTab(WT)
    centerGroupId = store.getState().activeGroupIdByWorktree[WT]
    dockedGroupId = store.getState().createEmptySplitGroup(WT, centerGroupId, 'down', {
      wholeLayout: true,
      dock: 'bottom'
    })!
    store.getState().createTab(WT, dockedGroupId, undefined, { quickCommandLabel: 'dev' })
    expect(store.getState().activeGroupIdByWorktree[WT]).toBe(dockedGroupId)
  })

  it('opens an editor in the split layout while the bottom panel is focused', () => {
    const editor = store.getState().createUnifiedTab(WT, 'editor', { id: 'a.ts', label: 'a.ts' })
    expect(editor.groupId).toBe(centerGroupId)
  })

  it('launches an agent terminal in the split layout even when aimed at the panel', () => {
    const agent = store
      .getState()
      .createTab(WT, dockedGroupId, undefined, { launchAgent: 'claude' })
    const unified = store.getState().unifiedTabsByWorktree[WT].find((t) => t.entityId === agent.id)
    expect(unified?.groupId).toBe(centerGroupId)
  })

  it('keeps plain terminals aimed at the panel there', () => {
    const shell = store.getState().createTab(WT, dockedGroupId)
    const unified = store.getState().unifiedTabsByWorktree[WT].find((t) => t.entityId === shell.id)
    expect(unified?.groupId).toBe(dockedGroupId)
  })

  it('adds a split-layout group above the panel when none is left', () => {
    const centerTabId = store.getState().groupsByWorktree[WT].find((g) => g.id === centerGroupId)!
      .tabOrder[0]
    store.getState().closeUnifiedTab(centerTabId)
    expect(findDockedGroupId(store.getState().groupsByWorktree[WT])).toBe(dockedGroupId)
    expect(store.getState().groupsByWorktree[WT]).toHaveLength(1)

    const editor = store.getState().createUnifiedTab(WT, 'editor', { id: 'b.ts', label: 'b.ts' })

    const layout = store.getState().layoutByWorktree[WT]
    expect(editor.groupId).not.toBe(dockedGroupId)
    expect(layout).toMatchObject({
      type: 'split',
      direction: 'vertical',
      first: { type: 'leaf', groupId: editor.groupId },
      second: { type: 'leaf', groupId: dockedGroupId }
    })
  })
})

describe('docked group persistence', () => {
  function sessionWithGroupDock(dock: unknown): unknown {
    const terminal = (id: string, groupId: string): Tab => ({
      ...tab(id, groupId, 0),
      worktreeId: 'w1'
    })
    return {
      activeRepoId: null,
      activeWorktreeId: null,
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      unifiedTabs: { w1: [terminal('t-main', 'g-main'), terminal('t-run', 'g-run')] },
      tabGroups: {
        w1: [
          { id: 'g-main', worktreeId: 'w1', activeTabId: 't-main', tabOrder: ['t-main'] },
          { id: 'g-run', worktreeId: 'w1', activeTabId: 't-run', tabOrder: ['t-run'], dock }
        ]
      }
    }
  }

  it('restores the bottom-panel group after a restart', () => {
    const session = workspaceSessionStateSchema.parse(sessionWithGroupDock('bottom'))
    const hydrated = buildHydratedTabState(session, new Set(['w1']))
    expect(findDockedGroupId(hydrated.groupsByWorktree.w1)).toBe('g-run')
  })

  it('degrades an unknown dock value to a normal group instead of dropping the session', () => {
    const session = workspaceSessionStateSchema.parse(sessionWithGroupDock('left'))
    expect(session.tabGroups?.w1).toHaveLength(2)
    expect(findDockedGroupId(session.tabGroups?.w1 ?? [])).toBeNull()
  })
})
