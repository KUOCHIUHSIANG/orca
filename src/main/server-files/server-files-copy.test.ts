import { describe, expect, it } from 'vitest'
import type { ServerProfile } from '../../shared/server-files-types'
import { FakeSftp } from './server-files-fake-sftp.test-fixture'
import { draftCopy, runCopy } from './server-files-copy'

const profile: ServerProfile = {
  id: 'prod',
  label: 'prod',
  endpoint: { kind: 'ssh-config', alias: 'prod' },
  auth: 'auto',
  identityFile: '',
  startPath: '',
  downloadDir: '',
  protectedPaths: ['/var/www/myshop'],
  projects: [
    {
      id: 'myshop',
      name: 'myshop',
      projectPath: '/var/www/myshop',
      backupPath: '/home/me/project',
      serviceName: 'kestrel-myshop.service',
      databaseName: 'myshop_db'
    }
  ],
  commandTemplates: []
}

function server(): FakeSftp {
  return new FakeSftp()
    .addDir('/var/www')
    .addDir('/var/www/myshop')
    .addFile('/var/www/myshop/myshop.dll', 'v2', { mtime: 1_700_000_100 })
    .addDir('/var/www/myshop/wwwroot')
    .addDir('/var/www/myshop/wwwroot/js')
    .addFile('/var/www/myshop/wwwroot/js/app.js', 'js')
    .addDir('/home')
    .addDir('/home/me')
    .addDir('/home/me/project')
    .addFile('/home/me/project/other.dll', 'another project')
}

const context = (sftp: FakeSftp) => ({
  sftp,
  identity: { uid: 1000, gids: [1000], userName: 'me', groupNames: ['me'] },
  protectedRoots: ['/var/www/myshop'],
  homePath: '/home/me'
})

describe('draftCopy: backups mirror the project path without renaming', () => {
  it('maps each item under the backup folder at the same relative path', async () => {
    const draft = await draftCopy(
      context(server()),
      {
        kind: 'backup',
        serverId: 'prod',
        projectId: 'myshop',
        sources: ['/var/www/myshop/myshop.dll', '/var/www/myshop/wwwroot/js/app.js']
      },
      profile
    )
    expect(draft.plan.items.map((item) => [item.source, item.destination])).toEqual([
      ['/var/www/myshop/myshop.dll', '/home/me/project/myshop.dll'],
      ['/var/www/myshop/wwwroot/js/app.js', '/home/me/project/wwwroot/js/app.js']
    ])
    expect(draft.plan.items[0].command).toBe(
      "mkdir -p -- '/home/me/project' && cp -a -- '/var/www/myshop/myshop.dll' '/home/me/project/myshop.dll'"
    )
  })

  it('lists what the backup folder already holds so the user can clear it first', async () => {
    const draft = await draftCopy(
      context(server()),
      {
        kind: 'backup',
        serverId: 'prod',
        projectId: 'myshop',
        sources: ['/var/www/myshop/myshop.dll']
      },
      profile
    )
    expect(draft.plan.leftovers.map((leftover) => leftover.path)).toEqual([
      '/home/me/project/other.dll'
    ])
    expect(draft.plan.leftoversRefusal).toBeNull()
  })

  it('never offers to clear a backup folder that is the home folder or holds the project', async () => {
    const home = { ...profile, projects: [{ ...profile.projects[0], backupPath: '/home/me' }] }
    const draft = await draftCopy(
      context(server()),
      {
        kind: 'backup',
        serverId: 'prod',
        projectId: 'myshop',
        sources: ['/var/www/myshop/myshop.dll']
      },
      home
    )
    expect(draft.plan.leftoversRefusal).toBe('home-or-root')
    const above = { ...profile, projects: [{ ...profile.projects[0], backupPath: '/var/www' }] }
    const overlapping = await draftCopy(
      context(server()),
      {
        kind: 'backup',
        serverId: 'prod',
        projectId: 'myshop',
        sources: ['/var/www/myshop/myshop.dll']
      },
      above
    )
    expect(overlapping.plan.leftoversRefusal).toBe('overlaps-project')
  })

  it('refuses items outside the project folder', async () => {
    await expect(
      draftCopy(
        context(server()),
        {
          kind: 'backup',
          serverId: 'prod',
          projectId: 'myshop',
          sources: ['/home/me/project/other.dll']
        },
        profile
      )
    ).rejects.toMatchObject({ failure: { code: 'invalid' } })
  })

  it('flags copies that would overwrite under a protected path', async () => {
    const sftp = server().addDir('/home/me/stage').addFile('/home/me/stage/myshop.dll', 'v3')
    const draft = await draftCopy(
      context(sftp),
      {
        kind: 'copy',
        serverId: 'prod',
        sources: ['/home/me/stage/myshop.dll'],
        destinationDir: '/var/www/myshop'
      },
      profile
    )
    expect(draft.plan.protectedOverwrites).toEqual(['/var/www/myshop/myshop.dll'])
  })
})

describe('runCopy', () => {
  const backup = async (sftp: FakeSftp) =>
    draftCopy(
      context(sftp),
      {
        kind: 'backup',
        serverId: 'prod',
        projectId: 'myshop',
        sources: ['/var/www/myshop/myshop.dll']
      },
      profile
    )

  function fakeServerCp(sftp: FakeSftp, corrupt = false) {
    return async (command: string): Promise<string> => {
      const [, source, destination] = /cp -a -- '([^']+)' '([^']+)'/.exec(command) ?? []
      const node = sftp.nodes.get(source)
      if (!node) {
        throw new Error('cp: cannot stat: No such file or directory')
      }
      sftp.nodes.set(destination, {
        ...node,
        content: corrupt ? Buffer.from('x') : node.content
      })
      return ''
    }
  }

  it('clears the leftovers first when asked, then copies and verifies', async () => {
    const sftp = server()
    const draft = await backup(sftp)
    const outcome = await runCopy(
      {
        sftp,
        jobId: 'job',
        signal: new AbortController().signal,
        emit: () => {},
        context: context(sftp),
        exec: fakeServerCp(sftp)
      },
      draft,
      {
        planId: 'p',
        jobId: 'job',
        clearLeftovers: true,
        overwriteExisting: true,
        protectedConfirmed: false
      }
    )
    expect(sftp.nodes.has('/home/me/project/other.dll')).toBe(false)
    expect(sftp.nodes.get('/home/me/project/myshop.dll')?.content.toString()).toBe('v2')
    expect(outcome).toEqual({
      status: 'done',
      verification: { checkedFiles: 1, mismatches: [] },
      warnings: []
    })
  })

  it('reports a copy whose size differs from the original', async () => {
    const sftp = server()
    const draft = await backup(sftp)
    const outcome = await runCopy(
      {
        sftp,
        jobId: 'job',
        signal: new AbortController().signal,
        emit: () => {},
        context: context(sftp),
        exec: fakeServerCp(sftp, true)
      },
      draft,
      {
        planId: 'p',
        jobId: 'job',
        clearLeftovers: false,
        overwriteExisting: true,
        protectedConfirmed: false
      }
    )
    expect(outcome.status === 'done' && outcome.verification?.mismatches).toEqual([
      { path: '/home/me/project/myshop.dll', reason: 'size' }
    ])
  })

  it('maps a server-side cp failure to a readable reason', async () => {
    const sftp = server()
    const draft = await backup(sftp)
    await expect(
      runCopy(
        {
          sftp,
          jobId: 'job',
          signal: new AbortController().signal,
          emit: () => {},
          context: context(sftp),
          exec: async (_command, options) => {
            options.onStderr?.(
              "cp: cannot create regular file '/home/me/project/myshop.dll': No space left on device"
            )
            throw new Error('exit 1')
          }
        },
        draft,
        {
          planId: 'p',
          jobId: 'job',
          clearLeftovers: false,
          overwriteExisting: true,
          protectedConfirmed: false
        }
      )
    ).rejects.toMatchObject({ failure: { code: 'no-space', path: '/var/www/myshop/myshop.dll' } })
  })
})
