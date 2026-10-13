import { diffArrays } from 'diff'

export type GitChangeHunkKind = 'added' | 'modified' | 'deleted'

/** One contiguous change of the buffer against HEAD, in 1-based line numbers. */
export type GitChangeHunk = {
  kind: GitChangeHunkKind
  /** For 'added', the HEAD line the insertion follows (0 = top of file). */
  originalStartLine: number
  originalLineCount: number
  /** For 'deleted', the buffer line the removal follows (0 = top of file). */
  modifiedStartLine: number
  modifiedLineCount: number
}

// Why: a wholesale rewrite can make Myers diff slow; past this budget show no markers rather than stall typing.
const DIFF_TIMEOUT_MS = 150

export function splitTextLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}

/** Returns null when the diff exceeds its time budget. */
export function computeGitChangeHunks(
  originalLines: readonly string[],
  modifiedLines: readonly string[]
): GitChangeHunk[] | null {
  // Why: trimming the shared head and tail keeps a typical edit's diff tiny regardless of file size.
  const sharedLength = Math.min(originalLines.length, modifiedLines.length)
  let prefix = 0
  while (prefix < sharedLength && originalLines[prefix] === modifiedLines[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < sharedLength - prefix &&
    originalLines[originalLines.length - 1 - suffix] ===
      modifiedLines[modifiedLines.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const originalMiddle = originalLines.slice(prefix, originalLines.length - suffix)
  const modifiedMiddle = modifiedLines.slice(prefix, modifiedLines.length - suffix)
  if (originalMiddle.length === 0 && modifiedMiddle.length === 0) {
    return []
  }
  const changes = diffArrays(originalMiddle, modifiedMiddle, { timeout: DIFF_TIMEOUT_MS })
  if (!changes) {
    return null
  }

  const hunks: GitChangeHunk[] = []
  let originalLine = prefix
  let modifiedLine = prefix
  let removed = 0
  let added = 0
  const flush = (): void => {
    if (removed === 0 && added === 0) {
      return
    }
    const originalBefore = originalLine - removed
    const modifiedBefore = modifiedLine - added
    if (removed === 0) {
      hunks.push({
        kind: 'added',
        originalStartLine: originalBefore,
        originalLineCount: 0,
        modifiedStartLine: modifiedBefore + 1,
        modifiedLineCount: added
      })
    } else if (added === 0) {
      hunks.push({
        kind: 'deleted',
        originalStartLine: originalBefore + 1,
        originalLineCount: removed,
        modifiedStartLine: modifiedBefore,
        modifiedLineCount: 0
      })
    } else {
      hunks.push({
        kind: 'modified',
        originalStartLine: originalBefore + 1,
        originalLineCount: removed,
        modifiedStartLine: modifiedBefore + 1,
        modifiedLineCount: added
      })
    }
    removed = 0
    added = 0
  }
  for (const change of changes) {
    if (change.removed) {
      removed += change.count
      originalLine += change.count
    } else if (change.added) {
      added += change.count
      modifiedLine += change.count
    } else {
      flush()
      originalLine += change.count
      modifiedLine += change.count
    }
  }
  flush()
  return hunks
}

export function areGitChangeHunksEqual(
  left: readonly GitChangeHunk[],
  right: readonly GitChangeHunk[]
): boolean {
  return (
    left.length === right.length &&
    left.every((hunk, index) => {
      const other = right[index]
      return (
        hunk.kind === other.kind &&
        hunk.originalStartLine === other.originalStartLine &&
        hunk.originalLineCount === other.originalLineCount &&
        hunk.modifiedStartLine === other.modifiedStartLine &&
        hunk.modifiedLineCount === other.modifiedLineCount
      )
    })
  )
}

/** Buffer lines carrying the hunk's gutter marker; a deletion marks the line above the gap. */
export function getGitChangeMarkerLines(hunk: GitChangeHunk): { start: number; end: number } {
  if (hunk.kind === 'deleted') {
    const line = Math.max(hunk.modifiedStartLine, 1)
    return { start: line, end: line }
  }
  return {
    start: hunk.modifiedStartLine,
    end: hunk.modifiedStartLine + hunk.modifiedLineCount - 1
  }
}

/** Line the peek sits under: the hunk's last line, or the line above a deletion (0 = top). */
export function getGitChangePeekAfterLine(hunk: GitChangeHunk): number {
  return hunk.kind === 'deleted'
    ? hunk.modifiedStartLine
    : hunk.modifiedStartLine + hunk.modifiedLineCount - 1
}

export function findGitChangeHunkIndexAtLine(
  hunks: readonly GitChangeHunk[],
  line: number
): number {
  return hunks.findIndex((hunk) => {
    const { start, end } = getGitChangeMarkerLines(hunk)
    return line >= start && line <= end
  })
}

/** Nearest hunk to a line; -1 only when there are no hunks. */
export function findClosestGitChangeHunkIndex(
  hunks: readonly GitChangeHunk[],
  line: number
): number {
  let closestIndex = -1
  let closestDistance = Number.POSITIVE_INFINITY
  hunks.forEach((hunk, index) => {
    const { start, end } = getGitChangeMarkerLines(hunk)
    const distance = line < start ? start - line : line > end ? line - end : 0
    if (distance < closestDistance) {
      closestIndex = index
      closestDistance = distance
    }
  })
  return closestIndex
}
