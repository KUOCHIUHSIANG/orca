import { describe, expect, it } from 'vitest'
import { canChangeFolder, canRemoveOrRename, formatRemoteMode } from './server-files-access'
import type { RemoteDirectoryState, RemoteEntry, RemoteIdentity } from './server-files-types'

const deploy: RemoteIdentity = { uid: 1000, gids: [1000, 33], userName: 'deploy', groupNames: [] }

function folder(overrides: Partial<RemoteDirectoryState> = {}): RemoteDirectoryState {
  return {
    path: '/var/www',
    node: { mode: 0o40755, uid: 0, gid: 0, owner: 'root', group: 'root' },
    writable: null,
    readOnlyFilesystem: false,
    freeBytes: null,
    entries: [],
    ...overrides
  }
}

function entry(name: string, overrides: Partial<RemoteEntry> = {}): RemoteEntry {
  return {
    name,
    path: `/var/www/${name}`,
    kind: 'file',
    targetIsDirectory: false,
    size: 1,
    modifiedMs: 0,
    mode: 0o100666,
    uid: 1000,
    gid: 1000,
    owner: 'deploy',
    group: 'deploy',
    ...overrides
  }
}

describe('delete and rename buttons follow the parent folder', () => {
  it('are disabled in a folder the login cannot write, even for its own writable file', () => {
    expect(canRemoveOrRename(folder(), [entry('app.dll')], deploy, [])).toEqual({
      state: 'denied',
      reason: 'folder-not-writable',
      path: '/var/www'
    })
  })

  it('trust the server-side test -w over mode bits (ACLs)', () => {
    expect(canRemoveOrRename(folder({ writable: true }), [entry('app.dll')], deploy, [])).toEqual({
      state: 'allowed'
    })
    expect(canChangeFolder(folder({ writable: false, node: null }), deploy).state).toBe('denied')
  })

  it('are disabled for protected paths and folders above them, whatever the server allows', () => {
    const writable = folder({ writable: true })
    expect(canRemoveOrRename(writable, [entry('prod')], deploy, ['/var/www/prod'])).toMatchObject({
      reason: 'protected'
    })
    expect(
      canRemoveOrRename(
        folder({ path: '/var', writable: true }),
        [entry('www', { path: '/var/www' })],
        deploy,
        ['/var/www/prod']
      )
    ).toMatchObject({ reason: 'protected-descendant' })
  })

  it('stay enabled but unconfirmed when the account cannot run commands', () => {
    expect(canRemoveOrRename(folder({ node: null }), [entry('a')], null, []).state).toBe('unknown')
  })

  it('respect read-only filesystems', () => {
    expect(
      canChangeFolder(folder({ writable: true, readOnlyFilesystem: true }), deploy)
    ).toMatchObject({
      reason: 'read-only-filesystem'
    })
  })
})

describe('formatRemoteMode', () => {
  it('matches ls -l, including setgid and sticky bits', () => {
    expect(formatRemoteMode(0o40755)).toBe('drwxr-xr-x')
    expect(formatRemoteMode(0o100640)).toBe('-rw-r-----')
    expect(formatRemoteMode(0o42775)).toBe('drwxrwsr-x')
    expect(formatRemoteMode(0o41777)).toBe('drwxrwxrwt')
    expect(formatRemoteMode(0o120777)).toBe('lrwxrwxrwx')
  })
})
