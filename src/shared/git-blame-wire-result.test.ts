import { describe, expect, it } from 'vitest'
import { readGitBlameWireResult } from './git-blame-wire-result'

const COMMIT = {
  sha: 'a'.repeat(40),
  author: 'Jater',
  authorEmail: 'jater@example.com',
  authorTime: 1,
  summary: 'init',
  path: 'a.ts'
}

describe('readGitBlameWireResult', () => {
  it('passes a well-formed result through', () => {
    const result = { commits: [{ ...COMMIT, previousSha: 'b'.repeat(40) }], lines: [[0, 1]] }
    expect(readGitBlameWireResult(result)).toEqual(result)
  })

  it('rejects a line that points past the commit table', () => {
    expect(() => readGitBlameWireResult({ commits: [COMMIT], lines: [[1, 1]] })).toThrow()
  })

  it('rejects a commit missing required fields', () => {
    expect(() => readGitBlameWireResult({ commits: [{ sha: 'x' }], lines: [] })).toThrow()
    expect(() => readGitBlameWireResult(null)).toThrow()
  })
})
