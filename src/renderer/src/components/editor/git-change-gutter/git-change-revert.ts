import type { IRange } from 'monaco-editor'
import type { GitChangeHunk } from './git-change-hunks'

export type GitChangeRevertBuffer = {
  lineCount: number
  getLineMaxColumn: (lineNumber: number) => number
  eol: string
}

/** The single edit that puts a hunk's HEAD lines back into the buffer. */
export function buildGitChangeRevertEdit(
  hunk: GitChangeHunk,
  baselineLines: readonly string[],
  buffer: GitChangeRevertBuffer
): { range: IRange; text: string } {
  const originalText = baselineLines
    .slice(hunk.originalStartLine - 1, hunk.originalStartLine - 1 + hunk.originalLineCount)
    .join(buffer.eol)
  const { lineCount, getLineMaxColumn, eol } = buffer

  if (hunk.kind === 'deleted') {
    const afterLine = hunk.modifiedStartLine
    if (afterLine === lineCount) {
      // Removed from the end: there is no following line to insert in front of.
      const column = getLineMaxColumn(afterLine)
      return { range: point(afterLine, column), text: `${eol}${originalText}` }
    }
    return { range: point(afterLine + 1, 1), text: `${originalText}${eol}` }
  }

  const startLine = hunk.modifiedStartLine
  const endLine = hunk.modifiedStartLine + hunk.modifiedLineCount - 1
  if (hunk.kind === 'modified') {
    return {
      range: {
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: getLineMaxColumn(endLine)
      },
      text: originalText
    }
  }
  if (endLine < lineCount) {
    return {
      range: {
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine + 1,
        endColumn: 1
      },
      text: ''
    }
  }
  // Added at the end: take the line break before the block with it.
  const startsAtTop = startLine === 1
  return {
    range: {
      startLineNumber: startsAtTop ? 1 : startLine - 1,
      startColumn: startsAtTop ? 1 : getLineMaxColumn(startLine - 1),
      endLineNumber: endLine,
      endColumn: getLineMaxColumn(endLine)
    },
    text: ''
  }
}

function point(lineNumber: number, column: number): IRange {
  return {
    startLineNumber: lineNumber,
    startColumn: column,
    endLineNumber: lineNumber,
    endColumn: column
  }
}
