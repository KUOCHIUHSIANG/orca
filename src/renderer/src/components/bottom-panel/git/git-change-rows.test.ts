import { describe, expect, it } from 'vitest'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'
import {
  buildGitChangeRows,
  stagedPathsForUnstage,
  summarizeGitChangeRows
} from './git-change-rows'

function entry(overrides: Partial<GitStatusEntry> & Pick<GitStatusEntry, 'path'>): GitStatusEntry {
  return { status: 'modified', area: 'unstaged', ...overrides }
}

describe('buildGitChangeRows', () => {
  it('merges a file staged and still edited into one indeterminate row', () => {
    const rows = buildGitChangeRows([
      entry({ path: 'b.ts', area: 'staged', status: 'added' }),
      entry({ path: 'b.ts', area: 'unstaged' }),
      entry({ path: 'a.ts', area: 'untracked', status: 'untracked' }),
      entry({ path: 'c.ts', area: 'staged' })
    ])

    expect(rows.map((row) => [row.path, row.status, row.checked])).toEqual([
      ['a.ts', 'untracked', false],
      ['b.ts', 'added', 'indeterminate'],
      ['c.ts', 'modified', true]
    ])
  })

  it('flags unresolved conflicts and skips submodule-internal rows', () => {
    const rows = buildGitChangeRows([
      entry({ path: 'x.ts', conflictKind: 'both_modified', conflictStatus: 'unresolved' }),
      entry({ path: 'sub/inner.ts', submoduleRoot: 'sub' })
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.conflicted).toBe(true)
  })
})

describe('summarizeGitChangeRows', () => {
  it('reports checked only when every row is fully staged', () => {
    const all = buildGitChangeRows([entry({ path: 'a', area: 'staged' })])
    const some = buildGitChangeRows([
      entry({ path: 'a', area: 'staged' }),
      entry({ path: 'b', area: 'unstaged' })
    ])
    const none = buildGitChangeRows([entry({ path: 'a' })])

    expect(summarizeGitChangeRows(all)).toMatchObject({ checked: true, stagedCount: 1 })
    expect(summarizeGitChangeRows(some)).toMatchObject({ checked: 'indeterminate', stagedCount: 1 })
    expect(summarizeGitChangeRows(none)).toMatchObject({ checked: false, stagedCount: 0 })
    expect(summarizeGitChangeRows([])).toMatchObject({ checked: false })
  })
})

describe('stagedPathsForUnstage', () => {
  it('includes the source path of a staged rename', () => {
    const rows = buildGitChangeRows([
      entry({ path: 'new.ts', area: 'staged', status: 'renamed', oldPath: 'old.ts' }),
      entry({ path: 'loose.ts' })
    ])

    expect(stagedPathsForUnstage(rows)).toEqual(['new.ts', 'old.ts'])
  })
})
