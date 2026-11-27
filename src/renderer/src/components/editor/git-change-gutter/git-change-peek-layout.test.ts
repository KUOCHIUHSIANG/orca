import { describe, expect, it } from 'vitest'
import type { GitChangeHunk } from './git-change-hunks'
import { getGitChangePeekBodyLineCount, getGitChangePeekFirstLine } from './git-change-peek-layout'

const oneLineEdit: GitChangeHunk = {
  kind: 'modified',
  originalStartLine: 23,
  originalLineCount: 1,
  modifiedStartLine: 23,
  modifiedLineCount: 1
}

describe('getGitChangePeekBodyLineCount', () => {
  it('fits the old and new lines plus two context lines on each side', () => {
    expect(getGitChangePeekBodyLineCount(oneLineEdit, 60)).toBe(6)
  })

  it('caps a large hunk at half the viewport and the hard maximum', () => {
    const large = { ...oneLineEdit, originalLineCount: 40, modifiedLineCount: 40 }
    expect(getGitChangePeekBodyLineCount(large, 20)).toBe(10)
    expect(getGitChangePeekBodyLineCount(large, 200)).toBe(18)
  })

  it('never collapses below the minimum in a tiny editor', () => {
    expect(getGitChangePeekBodyLineCount(oneLineEdit, 3)).toBe(4)
  })
})

describe('getGitChangePeekFirstLine', () => {
  it('starts two lines above the first changed line', () => {
    expect(getGitChangePeekFirstLine(oneLineEdit)).toBe(21)
  })

  it('treats the line after a deletion as the first changed line', () => {
    expect(
      getGitChangePeekFirstLine({
        kind: 'deleted',
        originalStartLine: 5,
        originalLineCount: 2,
        modifiedStartLine: 4,
        modifiedLineCount: 0
      })
    ).toBe(3)
  })

  it('clamps to the first line', () => {
    expect(getGitChangePeekFirstLine({ ...oneLineEdit, modifiedStartLine: 1 })).toBe(1)
  })
})
