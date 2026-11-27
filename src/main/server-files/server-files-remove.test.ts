import { describe, expect, it } from 'vitest'
import type { RemoteIdentity } from '../../shared/server-files-types'
import { FakeSftp } from './server-files-fake-sftp.test-fixture'
import { createProgressReporter } from './server-files-jobs'
import { draftRemoval, runRemoval } from './server-files-remove'

const deploy: RemoteIdentity = {
  uid: 1000,
  gids: [1000],
  userName: 'deploy',
  groupNames: ['deploy']
}

function context(sftp: FakeSftp, protectedRoots: string[] = [], identity = deploy) {
  return { sftp, identity, protectedRoots }
}

describe('draftRemoval: permissions come from the parent folder', () => {
  it('refuses when the parent folder is not writable, even if the file itself is', async () => {
    const sftp = new FakeSftp()
      .addDir('/var/www', { mode: 0o755, uid: 0, gid: 0 })
      .addFile('/var/www/app.dll', 'x', { mode: 0o666 })
    const draft = await draftRemoval(context(sftp), ['/var/www/app.dll'])
    expect(draft.plan.blocked).toEqual([
      { path: '/var/www/app.dll', reason: 'parent-not-writable' }
    ])
    expect(draft.steps).toEqual([])
  })

  it('allows a read-only file in a folder the user can write', async () => {
    const sftp = new FakeSftp()
      .addDir('/srv', { mode: 0o755 })
      .addFile('/srv/locked.dll', 'x', { mode: 0o444, uid: 0 })
    const draft = await draftRemoval(context(sftp), ['/srv/locked.dll'])
    expect(draft.plan.blocked).toEqual([])
    expect(draft.steps).toEqual([{ path: '/srv/locked.dll', folder: false }])
  })

  it('checks group membership before the other class', async () => {
    const sftp = new FakeSftp()
      .addDir('/shared', { mode: 0o775, uid: 0, gid: 50 })
      .addFile('/shared/a.txt', 'x')
    const outsider = await draftRemoval(context(sftp), ['/shared/a.txt'])
    const member = await draftRemoval(context(sftp, [], { ...deploy, gids: [1000, 50] }), [
      '/shared/a.txt'
    ])
    expect(outsider.plan.blocked[0]?.reason).toBe('parent-not-writable')
    expect(member.plan.blocked).toEqual([])
  })

  it('refuses a whole folder when any subfolder is not writable, removing nothing', async () => {
    const sftp = new FakeSftp()
      .addDir('/srv', { mode: 0o755 })
      .addDir('/srv/site')
      .addFile('/srv/site/index.html', 'x')
      .addDir('/srv/site/logs', { mode: 0o755, uid: 0, gid: 0 })
      .addFile('/srv/site/logs/today.log', 'x', { uid: 0 })
    const draft = await draftRemoval(context(sftp), ['/srv/site'])
    expect(draft.plan.blocked).toEqual([
      { path: '/srv/site/logs', reason: 'subfolder-not-writable' }
    ])
    expect(draft.steps).toEqual([])
  })

  it('applies the sticky-bit rule like /tmp', async () => {
    const sftp = new FakeSftp()
      .addDir('/tmp', { mode: 0o1777, uid: 0, gid: 0 })
      .addFile('/tmp/theirs', 'x', { uid: 2000 })
      .addFile('/tmp/mine', 'x', { uid: 1000 })
    const theirs = await draftRemoval(context(sftp), ['/tmp/theirs'])
    const mine = await draftRemoval(context(sftp), ['/tmp/mine'])
    expect(theirs.plan.blocked[0]?.reason).toBe('sticky-not-owner')
    expect(mine.plan.blocked).toEqual([])
  })

  it('lets root remove anything the server allows', async () => {
    const sftp = new FakeSftp()
      .addDir('/etc', { mode: 0o755, uid: 0 })
      .addFile('/etc/x.conf', 'x', { uid: 0 })
    const root = { uid: 0, gids: [0], userName: 'root', groupNames: ['root'] }
    const draft = await draftRemoval(context(sftp, [], root), ['/etc/x.conf'])
    expect(draft.plan.blocked).toEqual([])
  })

  it('orders children before their folder so every rmdir meets an empty folder', async () => {
    const sftp = new FakeSftp().addDir('/srv').addDir('/srv/a').addFile('/srv/a/b.txt', 'x')
    const draft = await draftRemoval(context(sftp), ['/srv/a', '/srv/a/b.txt'])
    expect(draft.steps).toEqual([
      { path: '/srv/a/b.txt', folder: false },
      { path: '/srv/a', folder: true }
    ])
    expect(draft.plan.items).toEqual([
      { path: '/srv/a', kind: 'directory', fileCount: 1, folderCount: 0 }
    ])
  })
})

describe('draftRemoval: protected paths are never removable', () => {
  const tree = () =>
    new FakeSftp()
      .addDir('/var/www')
      .addDir('/var/www/prod')
      .addFile('/var/www/prod/app.dll', 'x')
      .addDir('/var/www/prod2')
      .addDir('/home/deploy')
      .addLink('/home/deploy/live', '/var/www/prod')

  it('blocks the protected folder itself and anything inside it', async () => {
    const draft = await draftRemoval(context(tree(), ['/var/www/prod']), [
      '/var/www/prod',
      '/var/www/prod/app.dll'
    ])
    expect(draft.plan.blocked).toEqual([{ path: '/var/www/prod', reason: 'protected' }])
  })

  it('blocks a folder above a protected path, since removing it takes the path too', async () => {
    const draft = await draftRemoval(context(tree(), ['/var/www/prod']), ['/var/www'])
    expect(draft.plan.blocked).toEqual([{ path: '/var/www', reason: 'protected-descendant' }])
  })

  it('does not confuse a sibling that shares a prefix', async () => {
    const draft = await draftRemoval(context(tree(), ['/var/www/prod']), ['/var/www/prod2'])
    expect(draft.plan.blocked).toEqual([])
  })

  it('blocks a path reached through a symlinked folder', async () => {
    const draft = await draftRemoval(context(tree(), ['/var/www/prod']), [
      '/home/deploy/live/app.dll'
    ])
    expect(draft.plan.blocked).toEqual([{ path: '/home/deploy/live/app.dll', reason: 'protected' }])
  })
})

describe('runRemoval', () => {
  it('surfaces a server refusal with the path instead of failing silently', async () => {
    const sftp = new FakeSftp().addDir('/srv').addFile('/srv/a.txt', 'x').addFile('/srv/b.txt', 'x')
    sftp.denyWrites.add('/srv/b.txt')
    const progress = createProgressReporter({ jobId: 'j', totalBytes: 0, totalFiles: 2 }, () => {})
    const steps = [
      { path: '/srv/a.txt', folder: false },
      { path: '/srv/b.txt', folder: false }
    ]
    await expect(
      runRemoval(sftp, steps, new AbortController().signal, progress)
    ).rejects.toMatchObject({ failure: { code: 'permission-denied', path: '/srv/b.txt' } })
    expect(sftp.nodes.has('/srv/a.txt')).toBe(false)
    expect(sftp.nodes.has('/srv/b.txt')).toBe(true)
  })
})
