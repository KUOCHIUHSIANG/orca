import { describe, expect, it } from 'vitest'
import {
  computeGitChangeHunks,
  findClosestGitChangeHunkIndex,
  findGitChangeHunkIndexAtLine,
  getGitChangeMarkerLines,
  getGitChangePeekAfterLine,
  splitTextLines,
  type GitChangeHunk
} from './git-change-hunks'

function hunksFor(original: string, modified: string): GitChangeHunk[] | null {
  return computeGitChangeHunks(splitTextLines(original), splitTextLines(modified))
}

describe('computeGitChangeHunks', () => {
  it('returns no hunks for identical text', () => {
    expect(hunksFor('a\nb\nc\n', 'a\nb\nc\n')).toEqual([])
  })

  it('treats CRLF HEAD content and LF buffer lines as equal', () => {
    expect(hunksFor('a\r\nb\r\n', 'a\nb\n')).toEqual([])
  })

  it('reports a changed line as modified', () => {
    expect(hunksFor('a\nb\nc\n', 'a\nB\nc\n')).toEqual([
      {
        kind: 'modified',
        originalStartLine: 2,
        originalLineCount: 1,
        modifiedStartLine: 2,
        modifiedLineCount: 1
      }
    ])
  })

  it('reports inserted lines as added after the preceding HEAD line', () => {
    expect(hunksFor('a\nb\n', 'a\nx\ny\nb\n')).toEqual([
      {
        kind: 'added',
        originalStartLine: 1,
        originalLineCount: 0,
        modifiedStartLine: 2,
        modifiedLineCount: 2
      }
    ])
  })

  it('reports removed lines as deleted after the preceding buffer line', () => {
    expect(hunksFor('a\nb\nc\nd\n', 'a\nd\n')).toEqual([
      {
        kind: 'deleted',
        originalStartLine: 2,
        originalLineCount: 2,
        modifiedStartLine: 1,
        modifiedLineCount: 0
      }
    ])
  })

  it('anchors a deletion at the top of the file to line 0', () => {
    expect(hunksFor('a\nb\nc\n', 'c\n')).toEqual([
      {
        kind: 'deleted',
        originalStartLine: 1,
        originalLineCount: 2,
        modifiedStartLine: 0,
        modifiedLineCount: 0
      }
    ])
  })

  it('keeps separate hunks apart', () => {
    const hunks = hunksFor('1\n2\n3\n4\n5\n6\n', '1\nX\n3\n4\n5\n6\n7\n')
    expect(hunks?.map((hunk) => [hunk.kind, hunk.modifiedStartLine])).toEqual([
      ['modified', 2],
      ['added', 7]
    ])
  })
})

describe('gutter marker lines', () => {
  const modified: GitChangeHunk = {
    kind: 'modified',
    originalStartLine: 4,
    originalLineCount: 1,
    modifiedStartLine: 4,
    modifiedLineCount: 3
  }
  const deletedAtTop: GitChangeHunk = {
    kind: 'deleted',
    originalStartLine: 1,
    originalLineCount: 2,
    modifiedStartLine: 0,
    modifiedLineCount: 0
  }
  const deleted: GitChangeHunk = {
    kind: 'deleted',
    originalStartLine: 10,
    originalLineCount: 1,
    modifiedStartLine: 9,
    modifiedLineCount: 0
  }

  it('spans every buffer line of an added or modified hunk', () => {
    expect(getGitChangeMarkerLines(modified)).toEqual({ start: 4, end: 6 })
    expect(getGitChangePeekAfterLine(modified)).toBe(6)
  })

  it('marks the line above a deletion, or line 1 for a deletion at the top', () => {
    expect(getGitChangeMarkerLines(deleted)).toEqual({ start: 9, end: 9 })
    expect(getGitChangeMarkerLines(deletedAtTop)).toEqual({ start: 1, end: 1 })
    expect(getGitChangePeekAfterLine(deletedAtTop)).toBe(0)
  })

  it('finds the hunk a gutter click landed on', () => {
    const hunks = [deletedAtTop, modified, deleted]
    expect(findGitChangeHunkIndexAtLine(hunks, 1)).toBe(0)
    expect(findGitChangeHunkIndexAtLine(hunks, 5)).toBe(1)
    expect(findGitChangeHunkIndexAtLine(hunks, 9)).toBe(2)
    expect(findGitChangeHunkIndexAtLine(hunks, 7)).toBe(-1)
  })

  it('re-anchors to the nearest hunk', () => {
    const hunks = [modified, deleted]
    expect(findClosestGitChangeHunkIndex(hunks, 5)).toBe(0)
    expect(findClosestGitChangeHunkIndex(hunks, 8)).toBe(1)
    expect(findClosestGitChangeHunkIndex([], 8)).toBe(-1)
  })
})
