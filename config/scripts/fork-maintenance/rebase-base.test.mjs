import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRebaseBase } from './rebase-base.mjs'

let repo = null

function git(...args) {
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
    { cwd: repo, encoding: 'utf8' }
  ).trim()
}

function commit(message) {
  git('commit', '--allow-empty', '-q', '-m', message)
  return git('rev-parse', 'HEAD')
}

/** main: v1 ─ a ─ fork ─ b(v2); custom branches at `fork`, past v1 but before v2. */
function createForkRepo() {
  repo = mkdtempSync(path.join(os.tmpdir(), 'rebase-base-'))
  git('init', '-q', '-b', 'main')
  commit('release 1')
  git('tag', 'v1.0.0')
  commit('upstream a')
  const forkPoint = commit('fork point')
  git('switch', '-q', '-c', 'custom')
  commit('fork 1')
  commit('fork 2')
  git('switch', '-q', 'main')
  commit('upstream b')
  git('tag', 'v2.0.0')
  return forkPoint
}

afterEach(() => {
  if (repo) {
    rmSync(repo, { recursive: true, force: true })
    repo = null
  }
})

describe('resolveRebaseBase', () => {
  it('starts at the fork point, not the nearest older tag', () => {
    const forkPoint = createForkRepo()
    expect(
      resolveRebaseBase({ cwd: repo, branch: 'custom', targetTag: 'v2.0.0', upstreamMain: 'main' })
    ).toEqual({ kind: 'rebase', base: forkPoint })
  })

  it('refuses a tag cut before the fork point', () => {
    const forkPoint = createForkRepo()
    expect(
      resolveRebaseBase({ cwd: repo, branch: 'custom', targetTag: 'v1.0.0', upstreamMain: 'main' })
    ).toEqual({ kind: 'target-predates-fork', forkPoint })
  })

  it('reports a branch already sitting on the target', () => {
    createForkRepo()
    git('switch', '-q', '-c', 'synced', 'v2.0.0')
    commit('fork 1 rebased')
    expect(
      resolveRebaseBase({ cwd: repo, branch: 'synced', targetTag: 'v2.0.0', upstreamMain: 'main' })
    ).toEqual({ kind: 'already-based', base: git('rev-parse', 'v2.0.0^{commit}') })
  })
})
