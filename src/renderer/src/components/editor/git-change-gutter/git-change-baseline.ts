import { settingsForRuntimeOwner } from '@/runtime/runtime-rpc-client'
import { getRuntimeGitDiff } from '@/runtime/runtime-git-client'
import { useAppStore } from '@/store'
import type { GitDiffResult } from '../../../../../shared/git-diff-compare-types'

/** Where an edited file lives; the HEAD read routes to its owning host (local, SSH, or runtime). */
export type GitChangeFile = {
  worktreeId: string
  worktreePath: string
  relativePath: string
  runtimeEnvironmentId: string | null | undefined
  connectionId: string | undefined
}

/** HEAD's text for the file, or null when there is nothing meaningful to compare against. */
export function toGitChangeBaseline(result: GitDiffResult): string | null {
  // Why: an empty HEAD side means untracked, ignored, or a failed read — marking every line added is noise.
  if (
    result.kind !== 'text' ||
    result.largeDiffRenderLimit?.limited === true ||
    result.originalContent === ''
  ) {
    return null
  }
  return result.originalContent
}

export async function readGitChangeBaseline(file: GitChangeFile): Promise<string | null> {
  // Same HEAD-vs-working-tree read Changes mode uses; only the HEAD side is kept.
  const result = await getRuntimeGitDiff(
    {
      // Why: route by the file's owning runtime, not whichever runtime is focused.
      settings: settingsForRuntimeOwner(useAppStore.getState().settings, file.runtimeEnvironmentId),
      worktreeId: file.worktreeId,
      worktreePath: file.worktreePath,
      connectionId: file.connectionId
    },
    { filePath: file.relativePath, staged: false, compareAgainstHead: true }
  )
  return toGitChangeBaseline(result)
}
