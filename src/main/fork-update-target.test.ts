import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findSyncableUpstreamTag } from './fork-update-target'

let dir = ''
let upstream = ''
let fork = ''

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@localhost',
      '-c',
      'commit.gpgsign=false',
      ...args
    ],
    { cwd, encoding: 'utf8' }
  ).trim()
}

function commit(cwd: string, message: string): void {
  git(cwd, 'commit', '--allow-empty', '-q', '-m', message)
}

/** Cuts `tag` on its own release branch off `from`, like upstream's release commits. */
function release(from: string, tag: string): void {
  git(upstream, 'switch', '-q', '--detach', from)
  commit(upstream, `release: ${tag}`)
  git(upstream, 'tag', tag)
  git(upstream, 'switch', '-q', 'main')
}

beforeEach(() => {
  // main: m1 ─ m2 ─ m3; v1.0.0 off m1, v2.0.0 off m3; custom = v2.0.0 ─ fork.
  dir = mkdtempSync(path.join(os.tmpdir(), 'fork-update-target-'))
  upstream = path.join(dir, 'upstream')
  fork = path.join(dir, 'fork')
  git(dir, 'init', '-q', '-b', 'main', upstream)
  commit(upstream, 'm1')
  release('main', 'v1.0.0')
  commit(upstream, 'm2')
  commit(upstream, 'm3')
  release('main', 'v2.0.0')
  git(dir, 'clone', '-q', '-o', 'upstream', upstream, fork)
  git(fork, 'switch', '-q', '-c', 'custom', 'v2.0.0')
  commit(fork, 'fork 1')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const source = () => ({ repoRoot: fork, branch: 'custom', upstreamRemote: 'upstream' })

describe('findSyncableUpstreamTag', () => {
  it('skips a hotfix cut from a release older than the fork point', async () => {
    release('v1.0.0', 'v2.0.1')
    git(fork, 'fetch', '-q', 'upstream', '--tags')
    expect(await findSyncableUpstreamTag(source(), ['v2.0.1'])).toBeNull()
  })

  it('falls back to the newest tag that contains the fork point', async () => {
    commit(upstream, 'm4')
    release('main', 'v2.1.0')
    release('v1.0.0', 'v2.1.1')
    git(fork, 'fetch', '-q', 'upstream', '--tags')
    expect(await findSyncableUpstreamTag(source(), ['v2.1.1', 'v2.1.0'])).toBe('v2.1.0')
  })

  it('fetches tags the checkout has not seen yet', async () => {
    commit(upstream, 'm4')
    release('main', 'v2.1.0')
    expect(await findSyncableUpstreamTag(source(), ['v2.1.0'])).toBe('v2.1.0')
    expect(git(fork, 'tag', '-l', 'v2.1.0')).toBe('v2.1.0')
  })

  it('offers a tag it cannot verify so the sync script decides', async () => {
    expect(await findSyncableUpstreamTag(source(), ['v9.0.0'])).toBe('v9.0.0')
  })

  it('returns null when nothing is newer', async () => {
    expect(await findSyncableUpstreamTag(source(), [])).toBeNull()
  })
})
