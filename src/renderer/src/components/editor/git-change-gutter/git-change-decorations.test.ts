import { describe, expect, it } from 'vitest'
import { buildGitChangeDecorations } from './git-change-decorations'

const colors = { added: '#0a0', modified: '#00a', deleted: '#a00' }

describe('buildGitChangeDecorations', () => {
  it('marks every line of a modified hunk with its color', () => {
    const [decoration] = buildGitChangeDecorations(
      [
        {
          kind: 'modified',
          originalStartLine: 3,
          originalLineCount: 1,
          modifiedStartLine: 3,
          modifiedLineCount: 2
        }
      ],
      colors
    )
    expect(decoration.range).toEqual({
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 4,
      endColumn: 1
    })
    expect(decoration.options.linesDecorationsClassName).toBe(
      'orca-git-change-marker orca-git-change-modified'
    )
    expect(decoration.options.overviewRuler?.color).toBe('#00a')
  })

  it('uses the top variant for a deletion before the first line', () => {
    const [decoration] = buildGitChangeDecorations(
      [
        {
          kind: 'deleted',
          originalStartLine: 1,
          originalLineCount: 1,
          modifiedStartLine: 0,
          modifiedLineCount: 0
        }
      ],
      colors
    )
    expect(decoration.range.startLineNumber).toBe(1)
    expect(decoration.options.linesDecorationsClassName).toBe(
      'orca-git-change-marker orca-git-change-deleted orca-git-change-deleted-top'
    )
  })
})
