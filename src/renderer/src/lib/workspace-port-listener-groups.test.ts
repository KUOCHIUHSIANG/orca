import { describe, expect, it } from 'vitest'
import type { WorkspacePort } from '../../../shared/workspace-ports'
import {
  addressFamilyForBindHost,
  addressFamilyTag,
  formatBindAddress,
  groupWorkspacePortListeners
} from './workspace-port-listener-groups'

const owner = {
  worktreeId: 'wt',
  repoId: 'repo',
  displayName: 'repo',
  path: '/repo',
  confidence: 'cwd' as const
}

function port(bindHost: string, portNumber: number, pid?: number, advertisedUrl?: string) {
  const listener: WorkspacePort = {
    id: `${bindHost}:${portNumber}:${pid ?? 'unknown'}`,
    bindHost,
    connectHost: bindHost,
    port: portNumber,
    pid,
    processName: pid ? 'EcommerceApi' : undefined,
    protocol: 'http',
    kind: 'workspace',
    owner,
    ...(advertisedUrl ? { advertisedUrl } : {})
  }
  return listener
}

describe('groupWorkspacePortListeners', () => {
  it('merges the IPv4 and IPv6 listeners of one process on one port', () => {
    const v4 = port('127.0.0.1', 5016, 42)
    const v6 = port('::1', 5016, 42, 'http://localhost:5016')
    const groups = groupWorkspacePortListeners([v6, v4, port('::1', 3000, 7)])

    expect(groups).toHaveLength(2)
    expect(groups[0].port).toBe(v6)
    expect(groups[0].listeners).toEqual([
      { bindHost: '127.0.0.1', family: 'IPv4' },
      { bindHost: '::1', family: 'IPv6' }
    ])
    expect(addressFamilyTag(groups[0].listeners)).toBe('IPv4/IPv6')
    expect(addressFamilyTag(groups[1].listeners)).toBe('IPv6')
  })

  it('keeps different processes and unknown owners on separate rows', () => {
    expect(
      groupWorkspacePortListeners([port('127.0.0.1', 80, 1), port('::1', 80, 2)])
    ).toHaveLength(2)
    expect(groupWorkspacePortListeners([port('127.0.0.1', 80), port('::1', 80)])).toHaveLength(2)
  })
})

describe('address families', () => {
  it('classifies bind hosts and leaves wildcards unlabeled', () => {
    expect(addressFamilyForBindHost('0.0.0.0')).toBe('IPv4')
    expect(addressFamilyForBindHost('::')).toBe('IPv6')
    expect(addressFamilyForBindHost('*')).toBeNull()
    expect(addressFamilyTag([{ bindHost: '*', family: null }])).toBeNull()
  })

  it('brackets IPv6 bind addresses', () => {
    expect(formatBindAddress('::1', 7182)).toBe('[::1]:7182')
    expect(formatBindAddress('127.0.0.1', 7182)).toBe('127.0.0.1:7182')
  })
})
