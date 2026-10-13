import { describe, expect, it } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import { getLocatableActiveFilePath } from './file-explorer-locate-active-file'

const WORKTREE_PATH = '/repo'

function makeFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: 'file-1',
    filePath: '/repo/src/app.ts',
    relativePath: 'src/app.ts',
    worktreeId: 'wt-1',
    language: 'typescript',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

function makeState(
  file: OpenFile,
  overrides: Partial<Parameters<typeof getLocatableActiveFilePath>[0]> = {}
) {
  return {
    activeTabType: 'editor' as const,
    activeFileId: file.id,
    activeWorktreeId: 'wt-1',
    openFiles: [file],
    ...overrides
  }
}

describe('getLocatableActiveFilePath', () => {
  it('returns the path of the edit tab shown in the center', () => {
    const file = makeFile()
    expect(getLocatableActiveFilePath(makeState(file), WORKTREE_PATH)).toBe('/repo/src/app.ts')
  })

  it('accepts markdown previews and single-file diffs', () => {
    const preview = makeFile({ mode: 'markdown-preview', filePath: '/repo/README.md' })
    const diff = makeFile({ mode: 'diff', diffSource: 'unstaged' })
    expect(getLocatableActiveFilePath(makeState(preview), WORKTREE_PATH)).toBe('/repo/README.md')
    expect(getLocatableActiveFilePath(makeState(diff), WORKTREE_PATH)).toBe('/repo/src/app.ts')
  })

  it('ignores combined diffs whose path is the worktree root', () => {
    const combined = makeFile({ mode: 'diff', diffSource: 'combined-all', filePath: WORKTREE_PATH })
    expect(getLocatableActiveFilePath(makeState(combined), WORKTREE_PATH)).toBeNull()
  })

  it('ignores conflict-review and check-details tabs', () => {
    const review = makeFile({ mode: 'conflict-review', filePath: WORKTREE_PATH })
    const checks = makeFile({ mode: 'check-details' })
    expect(getLocatableActiveFilePath(makeState(review), WORKTREE_PATH)).toBeNull()
    expect(getLocatableActiveFilePath(makeState(checks), WORKTREE_PATH)).toBeNull()
  })

  it('returns null when a terminal or browser tab is in front', () => {
    const file = makeFile()
    expect(
      getLocatableActiveFilePath(makeState(file, { activeTabType: 'terminal' }), WORKTREE_PATH)
    ).toBeNull()
    expect(
      getLocatableActiveFilePath(makeState(file, { activeTabType: 'browser' }), WORKTREE_PATH)
    ).toBeNull()
  })

  it('returns null for files outside the worktree or owned by another worktree', () => {
    const external = makeFile({ filePath: '/elsewhere/notes.md' })
    const otherWorktree = makeFile({ worktreeId: 'wt-2' })
    expect(getLocatableActiveFilePath(makeState(external), WORKTREE_PATH)).toBeNull()
    expect(getLocatableActiveFilePath(makeState(otherWorktree), WORKTREE_PATH)).toBeNull()
    expect(getLocatableActiveFilePath(makeState(makeFile()), null)).toBeNull()
  })
})
