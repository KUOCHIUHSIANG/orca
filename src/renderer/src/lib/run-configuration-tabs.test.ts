import { describe, expect, it } from 'vitest'
import type { RunConfiguration } from '../../../shared/run-configuration-types'
import {
  findReusableRunTab,
  listRunTabs,
  resolvePrimaryRunTarget,
  type RunTab
} from './run-configuration-tabs'

function config(id: string, label: string): RunConfiguration {
  return {
    id,
    type: 'dotnet',
    label,
    command: `run ${label}`,
    projectPath: '/repo/Api.csproj',
    isAutoDetected: true
  }
}

const https = config('https', 'Api: https')
const http = config('http', 'Api: http')
const tab = (tabId: string, label: string, createdAt: number): RunTab => ({
  tabId,
  label,
  createdAt
})

describe('listRunTabs', () => {
  it('keeps only labeled terminal tabs', () => {
    expect(
      listRunTabs([
        { id: 'a', quickCommandLabel: ' Api: https ', createdAt: 1 },
        { id: 'b', quickCommandLabel: null, createdAt: 2 },
        { id: 'c', createdAt: 3 }
      ])
    ).toEqual([tab('a', 'Api: https', 1)])
  })
})

describe('findReusableRunTab', () => {
  it('picks the newest idle tab for the label', () => {
    const tabs = [tab('old', 'Api: https', 1), tab('new', 'Api: https', 2), tab('x', 'dev', 3)]
    expect(findReusableRunTab(tabs, 'Api: https', new Set())?.tabId).toBe('new')
    expect(findReusableRunTab(tabs, 'Api: https', new Set(['new']))?.tabId).toBe('old')
    expect(findReusableRunTab(tabs, 'Api: http', new Set())).toBeNull()
  })
})

describe('resolvePrimaryRunTarget', () => {
  const base = {
    configs: [http, https],
    runTabs: [tab('t1', 'Api: https', 1)],
    recentConfigId: null
  }

  it('follows the active run tab, stopping it while running', () => {
    expect(
      resolvePrimaryRunTarget({
        ...base,
        runningTabIds: new Set(['t1']),
        activeTerminalTabId: 't1'
      })
    ).toMatchObject({ label: 'Api: https', running: true, tabId: 't1' })
  })

  it('reruns an idle active run tab in place', () => {
    expect(
      resolvePrimaryRunTarget({ ...base, runningTabIds: new Set(), activeTerminalTabId: 't1' })
    ).toMatchObject({ config: https, running: false, tabId: 't1' })
  })

  it('falls back to the newest run tab config when no tab is active', () => {
    expect(
      resolvePrimaryRunTarget({
        ...base,
        runningTabIds: new Set(['t1']),
        activeTerminalTabId: null
      })
    ).toMatchObject({ config: https, running: true, tabId: null })
  })

  it('prefers the recent pick, then the first config', () => {
    expect(
      resolvePrimaryRunTarget({
        ...base,
        recentConfigId: 'http',
        runningTabIds: new Set(),
        activeTerminalTabId: null
      })
    ).toMatchObject({ config: http, running: false })
    expect(
      resolvePrimaryRunTarget({
        ...base,
        runTabs: [],
        runningTabIds: new Set(),
        activeTerminalTabId: 'other'
      })
    ).toMatchObject({ config: http })
  })

  it('ignores an idle active tab whose config disappeared', () => {
    expect(
      resolvePrimaryRunTarget({
        ...base,
        runTabs: [tab('t9', 'Gone', 5)],
        runningTabIds: new Set(),
        activeTerminalTabId: 't9'
      })
    ).toMatchObject({ config: http, tabId: null })
  })
})
