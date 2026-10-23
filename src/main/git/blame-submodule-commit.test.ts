import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getBlameSubmoduleCommit } from './blame-submodule-commit'
import { getCommitDiff } from './source-control/commit-diff'
import { clearSubmodulePathsCacheForTests } from './source-control/submodule-paths'

let root = ''
let outer = ''
let commitSha = ''
let parentSha = ''

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Jater',
      '-c',
      'user.email=jater@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'protocol.file.allow=always',
      ...args
    ],
    { cwd, encoding: 'utf8' }
  ).trim()
}

beforeEach(() => {
  // outer/app/Vue is a submodule whose second commit edits src/cart.js.
  root = mkdtempSync(path.join(os.tmpdir(), 'blame-submodule-'))
  const origin = path.join(root, 'vue-origin')
  mkdirSync(path.join(origin, 'src'), { recursive: true })
  git(root, 'init', '-q', '-b', 'main', origin)
  writeFileSync(path.join(origin, 'src', 'cart.js'), 'one\n')
  git(origin, 'add', '.')
  git(origin, 'commit', '-q', '-m', 'add cart')
  parentSha = git(origin, 'rev-parse', 'HEAD')
  writeFileSync(path.join(origin, 'src', 'cart.js'), 'one\ntwo\n')
  git(origin, 'commit', '-q', '-am', '結帳頁-\n\n商品卡片抽成共用元件')
  commitSha = git(origin, 'rev-parse', 'HEAD')

  outer = path.join(root, 'outer')
  git(root, 'init', '-q', '-b', 'main', outer)
  git(outer, 'commit', '-q', '--allow-empty', '-m', 'outer')
  git(outer, 'submodule', 'add', '-q', origin, 'app/Vue')
  git(outer, 'commit', '-q', '-m', 'add Vue')
  git(
    path.join(outer, 'app/Vue'),
    'remote',
    'set-url',
    'origin',
    'https://gitlab.com/team/ecommence.git'
  )
  clearSubmodulePathsCacheForTests()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('submodule commit reads from the parent worktree', () => {
  it('reads a submodule file commit diff inside the submodule', async () => {
    const diff = await getCommitDiff(outer, {
      commitOid: commitSha,
      parentOid: parentSha,
      filePath: 'app/Vue/src/cart.js'
    })
    expect(diff).toMatchObject({ originalContent: 'one\n', modifiedContent: 'one\ntwo\n' })
  })

  it('returns the full message and the submodule remote commit URL', async () => {
    const details = await getBlameSubmoduleCommit(outer, 'app/Vue', commitSha)
    expect(details.message).toBe('結帳頁-\n\n商品卡片抽成共用元件')
    expect(details.remoteUrl).toContain('gitlab.com/team/ecommence')
    expect(details.remoteUrl).toContain(commitSha)
  })

  it('refuses a submodule path that escapes the worktree', async () => {
    await expect(getBlameSubmoduleCommit(outer, '../vue-origin', commitSha)).rejects.toThrow(
      'Access denied'
    )
  })
})
