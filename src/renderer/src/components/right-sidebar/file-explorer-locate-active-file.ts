import { getRelativePathInsideRoot } from '@/lib/path'
import type { OpenFile } from '@/store/slices/editor'
import type { AppState } from '@/store/types'

type LocateActiveFileState = Pick<
  AppState,
  'activeTabType' | 'activeFileId' | 'activeWorktreeId' | 'openFiles'
>

/** Absolute path of the file the center editor is showing, when it maps to a row in this worktree's tree. */
export function getLocatableActiveFilePath(
  state: LocateActiveFileState,
  worktreePath: string | null
): string | null {
  const { activeTabType, activeFileId, activeWorktreeId, openFiles } = state
  if (activeTabType !== 'editor' || !activeFileId || !activeWorktreeId) {
    return null
  }
  const file = openFiles.find((f) => f.id === activeFileId)
  if (!file || file.worktreeId !== activeWorktreeId || !isSingleFileTab(file)) {
    return null
  }
  const relativePath = getRelativePathInsideRoot(file.filePath, worktreePath)
  return relativePath ? file.filePath : null
}

// Why: combined diffs and conflict-review tabs point filePath at the worktree root; check-details is virtual.
function isSingleFileTab(file: OpenFile): boolean {
  if (file.mode === 'edit' || file.mode === 'markdown-preview') {
    return true
  }
  return file.mode === 'diff' && !!file.diffSource && !file.diffSource.startsWith('combined-')
}
