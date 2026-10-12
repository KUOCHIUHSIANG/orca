import { describe, expect, it, vi } from 'vitest'
import {
  GIT_BLAME_UNCOMMITTED_SHA,
  loadGitBlameFromExecutor,
  parseGitBlamePorcelain
} from './git-blame'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

const PORCELAIN = [
  `${SHA_A} 1 1 2`,
  'author Jater',
  'author-mail <jater@example.com>',
  'author-time 1756721340',
  'author-tz +0800',
  'committer Jater',
  'committer-mail <jater@example.com>',
  'committer-time 1756721340',
  'committer-tz +0800',
  'summary 會員頁- 優惠券完成',
  'boundary',
  'filename src/a.ts',
  '\tfirst',
  `${SHA_A} 2 2`,
  '\tsecond',
  `${SHA_B} 7 3 1`,
  'author Omar',
  'author-mail <omar@example.com>',
  'author-time 1775554200',
  'author-tz +0800',
  'summary chore: init',
  `previous ${SHA_A} "src/\\346\\227\\247.ts"`,
  'filename src/a.ts',
  '\tthird',
  `${SHA_A} 3 4`,
  'filename src/a.ts',
  '\tfourth',
  ''
].join('\n')

describe('parseGitBlamePorcelain', () => {
  it('maps each line to its commit and original line, reading headers once per commit', () => {
    const result = parseGitBlamePorcelain(PORCELAIN)
    expect(result.commits).toEqual([
      {
        sha: SHA_A,
        author: 'Jater',
        authorEmail: 'jater@example.com',
        authorTime: 1756721340000,
        summary: '會員頁- 優惠券完成',
        path: 'src/a.ts'
      },
      {
        sha: SHA_B,
        author: 'Omar',
        authorEmail: 'omar@example.com',
        authorTime: 1775554200000,
        summary: 'chore: init',
        path: 'src/a.ts',
        previousSha: SHA_A,
        previousPath: 'src/旧.ts'
      }
    ])
    expect(result.lines).toEqual([
      [0, 1],
      [0, 2],
      [1, 7],
      [0, 3]
    ])
  })

  it('returns no lines for an empty file', () => {
    expect(parseGitBlamePorcelain('')).toEqual({ commits: [], lines: [] })
  })

  it('keeps the uncommitted marker commit like any other', () => {
    const result = parseGitBlamePorcelain(
      [
        `${GIT_BLAME_UNCOMMITTED_SHA} 1 1 1`,
        'author External file (--contents)',
        'author-mail <external.file>',
        'author-time 1791794696',
        'summary Version of a.ts from standard input',
        'filename a.ts',
        '\tx'
      ].join('\n')
    )
    expect(result.commits[0]?.sha).toBe(GIT_BLAME_UNCOMMITTED_SHA)
    expect(result.lines).toEqual([[0, 1]])
  })
})

describe('loadGitBlameFromExecutor', () => {
  it('pipes an unsaved buffer through --contents', async () => {
    const git = vi.fn(async () => ({ stdout: '' }))
    await loadGitBlameFromExecutor(git, '/repo', 'src/a.ts', { contents: 'draft' })
    expect(git).toHaveBeenCalledWith(
      ['blame', '--porcelain', '--contents', '-', '--', 'src/a.ts'],
      '/repo',
      'draft'
    )
  })

  it('refuses a path that git would read as an option', async () => {
    const git = vi.fn(async () => ({ stdout: '' }))
    await expect(loadGitBlameFromExecutor(git, '/repo', '--output=x')).rejects.toThrow()
    expect(git).not.toHaveBeenCalled()
  })
})
