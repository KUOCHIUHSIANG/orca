import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { consolidateForkCommits } from './consolidate-fork-commits.mjs'

let repo = null

function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
}

function write(file, text) {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
  writeFileSync(path.join(repo, file), text)
}

function commitAll(message) {
  git('add', '-A')
  git('commit', '-q', '-m', message)
}

afterEach(() => {
  if (repo) {
    rmSync(repo, { recursive: true, force: true })
    repo = null
  }
})

describe('consolidateForkCommits', () => {
  it('squashes per feature into the same tree, keeping the old history as a backup', () => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'consolidate-fork-'))
    git('init', '-q', '-b', 'custom')
    git('config', 'user.name', 'test')
    git('config', 'user.email', 'test@localhost')
    git('config', 'commit.gpgsign', 'false')
    write('src/shared/nav.ts', 'nav\n')
    write('src/old.ts', 'old\n')
    commitAll('upstream')
    git('tag', 'v1.0.0')

    write('src/components/monday-calendar/page.tsx', 'monday 1\n')
    write('src/shared/nav.ts', 'nav\nmonday entry\n')
    commitAll('feat: 左側新增 Monday 頁面')
    write('src/components/todo-calendar/page.tsx', 'todo\n')
    commitAll('feat: 左側新增「待辦」行事曆頁面')
    write('src/components/monday-calendar/page.tsx', 'monday 2\n')
    commitAll('fix: Monday 行事曆修正')
    write('src/shared/nav.ts', 'nav\nmonday entry\ntyped\n')
    commitAll('fix: 同步上游 v1.0.0 後修正型別錯誤')
    rmSync(path.join(repo, 'src/old.ts'))
    commitAll('feat: 待辦移除舊檔')
    const before = git('rev-parse', 'custom')

    const result = consolidateForkCommits({ cwd: repo, base: 'v1.0.0' })

    expect(result).toMatchObject({ ok: true, before: 5, after: 2 })
    expect(git('rev-parse', 'custom^{tree}')).toBe(git('rev-parse', `${before}^{tree}`))
    expect(git('rev-parse', 'backup/custom-before-consolidate')).toBe(before)
    expect(git('log', '--format=%s', 'v1.0.0..custom').split('\n')).toEqual([
      'feat: Microsoft To Do 待辦',
      'feat: Monday 頁面、通知與任務視窗'
    ])
    expect(git('status', '--porcelain')).toBe('')
  })
})
