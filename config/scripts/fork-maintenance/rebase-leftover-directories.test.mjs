import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findLeftoverDirectories } from './rebase-leftover-directories.mjs'

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

function write(relativePath, content = '') {
  mkdirSync(path.dirname(path.join(repo, relativePath)), { recursive: true })
  writeFileSync(path.join(repo, relativePath), content)
}

afterEach(() => {
  if (repo) {
    rmSync(repo, { recursive: true, force: true })
    repo = null
  }
})

describe('findLeftoverDirectories', () => {
  it('finds a dropped module whose ignored build output stayed behind', () => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'rebase-leftovers-'))
    git('init', '-q', '-b', 'main')
    write('.gitignore', 'native/mod/build/\n')
    write('native/keep/index.js', 'still tracked')
    write('native/mod/addon.cc', 'source')
    write('native/mod/build/addon.o', 'binary')
    git('add', '.')
    git('commit', '-q', '-m', 'with module')
    const previousHead = git('rev-parse', 'HEAD')
    git('rm', '-q', '-r', 'native/mod')
    write('.gitignore', '')
    git('commit', '-q', '-am', 'module dropped')
    write('notes/todo.txt', 'never tracked')

    expect(findLeftoverDirectories({ cwd: repo, previousHead })).toEqual(['native/mod'])
  })

  it('finds nothing in a clean checkout', () => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'rebase-leftovers-'))
    git('init', '-q', '-b', 'main')
    write('a.txt', 'a')
    git('add', '.')
    git('commit', '-q', '-m', 'a')
    expect(findLeftoverDirectories({ cwd: repo, previousHead: git('rev-parse', 'HEAD') })).toEqual(
      []
    )
  })
})
