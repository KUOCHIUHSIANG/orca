import type { GitFileStatus, GitStatusEntry } from '../../../../../shared/git-status-types'

export type GitChangeCheckState = boolean | 'indeterminate'

/** One file in the commit pane; its checkbox mirrors how much of the file is staged. */
export type GitChangeRow = {
  path: string
  status: GitFileStatus
  checked: GitChangeCheckState
  /** Index-side entry, when any part of the file is staged. */
  staged: GitStatusEntry | null
  /** Working-tree entry (unstaged or untracked), when anything is left unstaged. */
  pending: GitStatusEntry | null
  conflicted: boolean
}

export function buildGitChangeRows(entries: readonly GitStatusEntry[]): GitChangeRow[] {
  const byPath = new Map<
    string,
    { staged: GitStatusEntry | null; pending: GitStatusEntry | null }
  >()
  for (const entry of entries) {
    // Why: submodule-internal rows are never stageable from the parent worktree.
    if (entry.submoduleRoot) {
      continue
    }
    const slot = byPath.get(entry.path) ?? { staged: null, pending: null }
    if (entry.area === 'staged') {
      slot.staged = entry
    } else {
      slot.pending = entry
    }
    byPath.set(entry.path, slot)
  }
  const rows: GitChangeRow[] = []
  for (const [path, { staged, pending }] of byPath) {
    const primary = staged ?? pending
    if (!primary) {
      continue
    }
    rows.push({
      path,
      status: primary.status,
      checked: staged ? (pending ? 'indeterminate' : true) : false,
      staged,
      pending,
      conflicted: [staged, pending].some((entry) => entry?.conflictStatus === 'unresolved')
    })
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}

export function summarizeGitChangeRows(rows: readonly GitChangeRow[]): {
  checked: GitChangeCheckState
  stagedCount: number
  hasPartiallyStaged: boolean
  conflictCount: number
} {
  let fullyStaged = 0
  let stagedCount = 0
  let hasPartiallyStaged = false
  let conflictCount = 0
  for (const row of rows) {
    if (row.staged) {
      stagedCount += 1
    }
    if (row.checked === true) {
      fullyStaged += 1
    } else if (row.checked === 'indeterminate') {
      hasPartiallyStaged = true
    }
    if (row.conflicted) {
      conflictCount += 1
    }
  }
  const checked =
    rows.length > 0 && fullyStaged === rows.length
      ? true
      : stagedCount > 0
        ? 'indeterminate'
        : false
  return { checked, stagedCount, hasPartiallyStaged, conflictCount }
}

/** Paths to unstage for `rows`, including the source path of staged renames. */
export function stagedPathsForUnstage(rows: readonly GitChangeRow[]): string[] {
  const paths = new Set<string>()
  for (const row of rows) {
    if (!row.staged) {
      continue
    }
    paths.add(row.path)
    if (row.staged.oldPath) {
      paths.add(row.staged.oldPath)
    }
  }
  return [...paths]
}
