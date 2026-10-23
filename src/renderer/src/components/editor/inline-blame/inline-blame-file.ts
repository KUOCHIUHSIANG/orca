import { useAppStore } from '@/store'
import { requireRuntimeTargetForFileOwner } from '@/lib/file-owner-runtime-target'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'

/** Where a blamed editor file lives; every git read for its blame routes through this. */
export type InlineBlameFile = {
  fileId: string
  worktreeId: string
  worktreePath: string
  relativePath: string
  runtimeEnvironmentId: string | null | undefined
  connectionId: string | undefined
  /** Folder workspaces have no git tool window to reveal a commit in. */
  isFolderWorkspace: boolean
  /** Set once blame finds the file in a submodule: its path from the worktree root. */
  submodulePath?: string
}

/** Throws when the file's owner can't be resolved, so callers must catch. */
export function toBlameRuntimeGitContext(file: InlineBlameFile): RuntimeGitContext {
  return {
    // Why: route by the file's owning runtime, not whichever runtime is focused.
    target: requireRuntimeTargetForFileOwner(
      useAppStore.getState(),
      file.worktreeId,
      file.runtimeEnvironmentId
    ),
    worktreeId: file.worktreeId,
    worktreePath: file.worktreePath,
    connectionId: file.connectionId
  }
}

/** The worktree-relative path of a path blame reported inside `file`'s submodule, if any. */
export function blameWorktreePath(file: InlineBlameFile, commitPath: string): string {
  return file.submodulePath ? `${file.submodulePath}/${commitPath}` : commitPath
}

/** Blame data is only comparable within one host + worktree, since SHAs and paths are per-repo. */
export function blameFileScopeKey(file: InlineBlameFile): string {
  return [file.runtimeEnvironmentId ?? '', file.connectionId ?? '', file.worktreeId].join('\0')
}
