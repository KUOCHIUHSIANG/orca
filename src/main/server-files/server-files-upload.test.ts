import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { OverwritePolicy } from '../../shared/server-files-types'
import { FakeSftp } from './server-files-fake-sftp.test-fixture'
import { draftUpload, runUpload, selectFilesToWrite } from './server-files-upload'

const OLD = 1_700_000_000
const NEW = OLD + 3600

let local: string

function localFile(relative: string, content: string, mtimeSeconds: number): void {
  const path = join(local, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  utimesSync(path, mtimeSeconds, mtimeSeconds)
}

beforeEach(() => {
  local = mkdtempSync(join(tmpdir(), 'server-files-upload-'))
  localFile('publish/MyApi.dll', 'new api', NEW)
  localFile('publish/Same.dll', 'same', OLD)
  localFile('publish/Older.dll', 'older', OLD)
  localFile('publish/Brand.dll', 'brand new', NEW)
  localFile('publish/runtimes/linux/native.so', 'native', NEW)
})

afterEach(() => {
  rmSync(local, { recursive: true, force: true })
})

function server(): FakeSftp {
  return new FakeSftp()
    .addDir('/var/www')
    .addDir('/var/www/api')
    .addFile('/var/www/api/MyApi.dll', 'old api', { mtime: OLD })
    .addFile('/var/www/api/Same.dll', 'same', { mtime: OLD })
    .addFile('/var/www/api/Older.dll', 'server newer', { mtime: NEW })
    .addDir('/var/www/api/runtimes')
    .addDir('/var/www/api/runtimes/linux')
    .addFile('/var/www/api/runtimes/linux/native.so', 'old native', { mtime: OLD })
}

const context = (sftp: FakeSftp, protectedRoots: string[] = []) => ({
  sftp,
  identity: { uid: 1000, gids: [1000], userName: 'deploy', groupNames: ['deploy'] },
  protectedRoots
})

async function plan(sftp = server(), protectedRoots: string[] = []) {
  return draftUpload(
    context(sftp, protectedRoots),
    [join(local, 'publish')],
    '/var/www/api',
    'contents'
  )
}

function written(
  draft: Awaited<ReturnType<typeof plan>>,
  policy: OverwritePolicy,
  overwrite: string[] = []
): string[] {
  return selectFilesToWrite(draft.files, { policy, overwrite, protectedConfirmed: true })
    .map((file) => file.remotePath)
    .sort()
}

describe('draftUpload', () => {
  it('finds same-name files inside subfolders, not only at the top', async () => {
    const draft = await plan()
    expect(
      draft.files
        .filter((file) => file.conflict)
        .map((file) => file.conflict?.relativePath)
        .sort()
    ).toEqual(['MyApi.dll', 'Older.dll', 'Same.dll', 'runtimes/linux/native.so'])
    expect(draft.files.find((file) => file.remotePath.endsWith('Same.dll'))?.conflict?.newer).toBe(
      'same'
    )
    expect(draft.files.find((file) => file.remotePath.endsWith('Older.dll'))?.conflict?.newer).toBe(
      'destination'
    )
  })

  it('never follows a local symlink', async () => {
    symlinkSync('/etc/hosts', join(local, 'publish', 'hosts'))
    const draft = await plan()
    expect(draft.skippedLinks).toEqual([join(local, 'publish', 'hosts')])
    expect(draft.files.some((file) => file.localPath.endsWith('hosts'))).toBe(false)
  })

  it('marks conflicts under a protected path', async () => {
    const draft = await plan(server(), ['/var/www/api/runtimes'])
    const flagged = draft.files
      .filter((file) => file.conflict?.protected)
      .map((file) => file.remotePath)
    expect(flagged).toEqual(['/var/www/api/runtimes/linux/native.so'])
  })
})

describe('selectFilesToWrite: the four overwrite choices', () => {
  it('overwrite all writes every file', async () => {
    const draft = await plan()
    expect(written(draft, 'overwrite')).toHaveLength(5)
  })

  it('skip all writes only new files', async () => {
    expect(written(await plan(), 'skip')).toEqual(['/var/www/api/Brand.dll'])
  })

  it('overwrite only newer skips equal and server-newer files', async () => {
    expect(written(await plan(), 'newer')).toEqual([
      '/var/www/api/Brand.dll',
      '/var/www/api/MyApi.dll',
      '/var/www/api/runtimes/linux/native.so'
    ])
  })

  it('per-file choice overwrites exactly what was picked', async () => {
    expect(written(await plan(), 'each', ['Older.dll'])).toEqual([
      '/var/www/api/Brand.dll',
      '/var/www/api/Older.dll'
    ])
  })

  it('rejects a choice naming a file that is not in the plan', async () => {
    const draft = await plan()
    expect(() =>
      selectFilesToWrite(draft.files, {
        policy: 'each',
        overwrite: ['../../etc/passwd'],
        protectedConfirmed: true
      })
    ).toThrow(expect.objectContaining({ failure: expect.objectContaining({ code: 'invalid' }) }))
  })

  it('needs the extra confirmation before overwriting under a protected path', async () => {
    const draft = await plan(server(), ['/var/www/api'])
    expect(() =>
      selectFilesToWrite(draft.files, {
        policy: 'overwrite',
        overwrite: [],
        protectedConfirmed: false
      })
    ).toThrow(expect.objectContaining({ failure: expect.objectContaining({ code: 'protected' }) }))
    // New files inside a protected path need no extra confirmation.
    expect(
      selectFilesToWrite(draft.files, { policy: 'skip', overwrite: [], protectedConfirmed: false })
    ).toHaveLength(1)
  })
})

describe('runUpload', () => {
  it('writes the content and keeps the local modified time for the next comparison', async () => {
    const sftp = server()
    const draft = await plan(sftp)
    const files = selectFilesToWrite(draft.files, {
      policy: 'newer',
      overwrite: [],
      protectedConfirmed: false
    })
    const outcome = await runUpload(
      { sftp, jobId: 'job', signal: new AbortController().signal, emit: () => {} },
      draft,
      files
    )
    expect(outcome).toEqual({ status: 'done', warnings: [] })
    const api = sftp.nodes.get('/var/www/api/MyApi.dll')
    expect(api?.content.toString()).toBe('new api')
    expect(api?.mtime).toBe(NEW)
    expect(sftp.nodes.get('/var/www/api/Older.dll')?.content.toString()).toBe('server newer')
  })

  it('reports a full disk instead of a bare failure', async () => {
    const sftp = server()
    const draft = await plan(sftp)
    sftp.freeBytes = 0
    await expect(
      runUpload(
        { sftp, jobId: 'job', signal: new AbortController().signal, emit: () => {} },
        draft,
        draft.files
      )
    ).rejects.toMatchObject({ failure: { code: 'no-space' } })
  })
})
