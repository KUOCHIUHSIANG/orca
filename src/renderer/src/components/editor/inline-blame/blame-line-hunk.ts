import { structuredPatch } from 'diff'

export type BlameHunkLine = {
  /** Stable within a hunk: the side's marker plus its line number on that side. */
  key: string
  kind: 'added' | 'removed'
  text: string
  /** The blamed line itself, so the card can emphasise it. */
  current?: boolean
}

export type BlameHunk = { lines: BlameHunkLine[]; truncated: boolean }

export const BLAME_HUNK_MAX_LINES = 12
// Why: a pathological diff must not stall the renderer while a hover card opens.
const DIFF_TIMEOUT_MS = 250

/** The change that introduced `line` (1-based, in `modified`), trimmed to a window around it. */
export function findBlameLineHunk(
  original: string,
  modified: string,
  line: number
): BlameHunk | null {
  const patch = structuredPatch('a', 'b', original, modified, undefined, undefined, {
    context: 0,
    timeout: DIFF_TIMEOUT_MS
  })
  const hunk = patch?.hunks.find(
    (candidate) => line >= candidate.newStart && line < candidate.newStart + candidate.newLines
  )
  if (!hunk) {
    return null
  }
  const lines: BlameHunkLine[] = []
  let newLine = hunk.newStart
  let oldLine = hunk.oldStart
  let currentIndex = 0
  for (const raw of hunk.lines) {
    const marker = raw[0]
    if (marker !== '+' && marker !== '-') {
      continue
    }
    const text = raw.slice(1).replace(/\r$/, '')
    if (marker === '-') {
      lines.push({ key: `-${oldLine}`, kind: 'removed', text })
      oldLine += 1
      continue
    }
    const key = `+${newLine}`
    if (newLine === line) {
      currentIndex = lines.length
      lines.push({ key, kind: 'added', text, current: true })
    } else {
      lines.push({ key, kind: 'added', text })
    }
    newLine += 1
  }
  if (lines.length <= BLAME_HUNK_MAX_LINES) {
    return { lines, truncated: false }
  }
  const start = Math.min(
    Math.max(0, currentIndex - Math.floor(BLAME_HUNK_MAX_LINES / 2)),
    lines.length - BLAME_HUNK_MAX_LINES
  )
  return { lines: lines.slice(start, start + BLAME_HUNK_MAX_LINES), truncated: true }
}
