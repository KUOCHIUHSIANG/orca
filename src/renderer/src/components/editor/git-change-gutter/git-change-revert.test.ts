import { describe, expect, it } from 'vitest'
import type { IRange } from 'monaco-editor'
import { computeGitChangeHunks, splitTextLines } from './git-change-hunks'
import { buildGitChangeRevertEdit } from './git-change-revert'

function applyEdit(text: string, range: IRange, replacement: string): string {
  const lines = splitTextLines(text)
  const offsetOf = (lineNumber: number, column: number): number =>
    lines.slice(0, lineNumber - 1).reduce((sum, line) => sum + line.length + 1, 0) + column - 1
  return (
    text.slice(0, offsetOf(range.startLineNumber, range.startColumn)) +
    replacement +
    text.slice(offsetOf(range.endLineNumber, range.endColumn))
  )
}

/** Reverts the hunk at `index` and returns the resulting buffer text. */
function revertHunk(original: string, modified: string, index: number): string {
  const baselineLines = splitTextLines(original)
  const modifiedLines = splitTextLines(modified)
  const hunk = computeGitChangeHunks(baselineLines, modifiedLines)![index]
  const edit = buildGitChangeRevertEdit(hunk, baselineLines, {
    lineCount: modifiedLines.length,
    getLineMaxColumn: (lineNumber) => modifiedLines[lineNumber - 1].length + 1,
    eol: '\n'
  })
  return applyEdit(modified, edit.range, edit.text)
}

describe('buildGitChangeRevertEdit', () => {
  it.each([
    ['a modified line', 'a\nb\nc\n', 'a\nB\nc\n'],
    ['a modified block that changed size', 'a\nb\nc\nd\n', 'a\nX\nd\n'],
    ['lines added in the middle', 'a\nb\n', 'a\nx\ny\nb\n'],
    ['lines added at the end without a trailing newline', 'a\nb', 'a\nb\nx'],
    ['lines added at the top', 'a\nb\n', 'x\na\nb\n'],
    ['lines deleted in the middle', 'a\nb\nc\nd\n', 'a\nd\n'],
    ['lines deleted at the top', 'a\nb\nc\n', 'c\n'],
    ['lines deleted at the end without a trailing newline', 'a\nb\nc', 'a']
  ])('restores HEAD for %s', (_label, original, modified) => {
    expect(revertHunk(original, modified, 0)).toBe(original)
  })

  it('reverts one hunk and leaves the others in place', () => {
    const original = '1\n2\n3\n4\n5\n6\n'
    const modified = '1\nX\n3\n4\n5\n6\n7\n'
    expect(revertHunk(original, modified, 0)).toBe('1\n2\n3\n4\n5\n6\n7\n')
    expect(revertHunk(original, modified, 1)).toBe('1\nX\n3\n4\n5\n6\n')
  })

  it('joins restored lines with the buffer line ending', () => {
    const baselineLines = splitTextLines('a\r\nb\r\nc\r\n')
    const edit = buildGitChangeRevertEdit(
      {
        kind: 'deleted',
        originalStartLine: 2,
        originalLineCount: 2,
        modifiedStartLine: 1,
        modifiedLineCount: 0
      },
      baselineLines,
      { lineCount: 2, getLineMaxColumn: () => 2, eol: '\r\n' }
    )
    expect(edit.text).toBe('b\r\nc\r\n')
  })
})
