import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConflictsWithClaude } from './claude-conflict-resolution.mjs'

let tempDir = null
let repo = null

const FAKE_CLAUDE = `
const { readFileSync, writeFileSync } = require('node:fs')
const mode = process.argv[2]
readFileSync(0, 'utf8')
if (mode === 'resolve') writeFileSync('f.txt', 'merged\\n')
process.exit(mode === 'crash' ? 3 : 0)
`

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

function commitFile(content, message) {
  writeFileSync(path.join(repo, 'f.txt'), content)
  git('add', 'f.txt')
  git('commit', '-q', '-m', message)
}

/** Leaves `fork` mid-rebase onto `main`, conflicted in f.txt. */
function createConflictedRebase() {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'claude-conflict-'))
  repo = path.join(tempDir, 'repo')
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  commitFile('base\n', 'base')
  git('switch', '-q', '-c', 'fork')
  commitFile('fork\n', 'fork change')
  git('switch', '-q', 'main')
  commitFile('upstream\n', 'upstream change')
  git('switch', '-q', 'fork')
  spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@localhost', 'rebase', 'main'], {
    cwd: repo
  })
  writeFileSync(path.join(tempDir, 'fake-claude.cjs'), FAKE_CLAUDE)
}

function resolveWith(mode, program = process.execPath) {
  return resolveConflictsWithClaude({
    cwd: repo,
    files: ['f.txt'],
    onto: 'main',
    claudeProgram: program,
    claudeArgsPrefix: [path.join(tempDir, 'fake-claude.cjs'), mode]
  })
}

function unmergedFiles() {
  return git('diff', '--name-only', '--diff-filter=U')
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
    repo = null
  }
})

describe('resolveConflictsWithClaude', () => {
  it('stages the files once Claude leaves no conflict markers', () => {
    createConflictedRebase()
    expect(resolveWith('resolve')).toEqual({ ok: true })
    expect(unmergedFiles()).toBe('')
    expect(readFileSync(path.join(repo, 'f.txt'), 'utf8')).toBe('merged\n')
  })

  it('refuses files Claude left with conflict markers', () => {
    createConflictedRebase()
    expect(resolveWith('give-up')).toEqual({ ok: false, reason: 'Claude Code 未解完：f.txt' })
    expect(unmergedFiles()).toBe('f.txt')
  })

  it('reports a failed Claude run without staging', () => {
    createConflictedRebase()
    expect(resolveWith('crash')).toEqual({ ok: false, reason: 'Claude Code 執行失敗（exit 3）' })
    expect(unmergedFiles()).toBe('f.txt')
  })

  it('reports a missing claude command', () => {
    createConflictedRebase()
    expect(resolveWith('resolve', 'claude-missing-for-test')).toEqual({
      ok: false,
      reason: '找不到 claude-missing-for-test 指令'
    })
  })
})
