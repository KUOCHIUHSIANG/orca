import type { GitChangeHunk } from './git-change-hunks'

export const GIT_CHANGE_PEEK_HEADER_HEIGHT_PX = 28
// Top + bottom hairlines of the peek frame.
export const GIT_CHANGE_PEEK_BORDER_PX = 2
const PEEK_CONTEXT_LINES = 2
const PEEK_MIN_BODY_LINES = 4
const PEEK_MAX_BODY_LINES = 18

/** Body height in lines: the hunk's old + new lines plus context, capped at half the viewport. */
export function getGitChangePeekBodyLineCount(
  hunk: GitChangeHunk,
  viewportLineCount: number
): number {
  const wanted = hunk.originalLineCount + hunk.modifiedLineCount + PEEK_CONTEXT_LINES * 2
  const ceiling = Math.max(
    PEEK_MIN_BODY_LINES,
    Math.min(PEEK_MAX_BODY_LINES, Math.floor(viewportLineCount / 2))
  )
  return Math.min(Math.max(wanted, PEEK_MIN_BODY_LINES), ceiling)
}

/** First buffer line to show at the top of the peek so the change has context above it. */
export function getGitChangePeekFirstLine(hunk: GitChangeHunk): number {
  const firstChangedLine =
    hunk.kind === 'deleted' ? hunk.modifiedStartLine + 1 : hunk.modifiedStartLine
  return Math.max(1, firstChangedLine - PEEK_CONTEXT_LINES)
}
