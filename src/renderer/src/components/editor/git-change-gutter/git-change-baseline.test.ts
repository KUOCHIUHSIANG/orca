import { describe, expect, it } from 'vitest'
import { toGitChangeBaseline } from './git-change-baseline'

describe('toGitChangeBaseline', () => {
  it('keeps the HEAD side of a text diff', () => {
    expect(
      toGitChangeBaseline({
        kind: 'text',
        originalContent: 'head\n',
        modifiedContent: 'work\n',
        originalIsBinary: false,
        modifiedIsBinary: false
      })
    ).toBe('head\n')
  })

  it('drops files with no HEAD content, pruned large diffs, and binaries', () => {
    expect(
      toGitChangeBaseline({
        kind: 'text',
        originalContent: '',
        modifiedContent: 'new\n',
        originalIsBinary: false,
        modifiedIsBinary: false
      })
    ).toBeNull()
    expect(
      toGitChangeBaseline({
        kind: 'text',
        originalContent: '',
        modifiedContent: '',
        originalIsBinary: false,
        modifiedIsBinary: false,
        largeDiffRenderLimit: {
          limited: true,
          reason: 'line-count',
          lineCounts: null,
          characterCount: 0,
          limits: { maxLinesPerSide: 1, maxCombinedCharacters: 1 }
        }
      })
    ).toBeNull()
    expect(
      toGitChangeBaseline({
        kind: 'binary',
        originalContent: 'x',
        modifiedContent: 'y',
        originalIsBinary: true,
        modifiedIsBinary: true
      })
    ).toBeNull()
  })
})
