import {
  getRuntimeGitBlameSubmoduleCommit,
  getRuntimeGitCommitDiff
} from '@/runtime/runtime-git-diff-client'
import { getRuntimeGitHistory } from '@/runtime/runtime-git-status-client'
import { getRuntimeGitRemoteCommitUrl } from '@/runtime/runtime-git-working-tree-client'
import type { GitBlameCommit, GitBlameSubmoduleCommit } from '../../../../../shared/git-blame'
import type { GitDiffResult } from '../../../../../shared/git-diff-compare-types'
import { findBlameLineHunk, type BlameHunk } from './blame-line-hunk'
import {
  blameFileScopeKey,
  blameWorktreePath,
  toBlameRuntimeGitContext,
  type InlineBlameFile
} from './inline-blame-file'

// Bounds what hovering many lines keeps alive; commits are immutable, so entries never go stale.
const MAX_CACHED_DETAILS = 200
// Each diff holds two full file versions, so keep only the few most recently hovered.
const MAX_CACHED_DIFFS = 8
const messageCache = new Map<string, Promise<string | null>>()
const remoteUrlCache = new Map<string, Promise<string | null>>()
const diffCache = new Map<string, Promise<GitDiffResult>>()
const submoduleCommitCache = new Map<string, Promise<GitBlameSubmoduleCommit>>()

function cached<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
  maxEntries = MAX_CACHED_DETAILS
): Promise<T> {
  const existing = cache.get(key)
  if (existing) {
    return existing
  }
  const pending = load()
  cache.set(key, pending)
  pending.catch(() => cache.delete(key))
  if (cache.size > maxEntries) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  return pending
}

// Why one read for both: the worktree's history and remote-URL reads can't see submodule commits.
function loadSubmoduleCommit(
  file: InlineBlameFile,
  submodulePath: string,
  sha: string
): Promise<GitBlameSubmoduleCommit> {
  return cached(submoduleCommitCache, `${blameFileScopeKey(file)}\0${submodulePath}\0${sha}`, () =>
    getRuntimeGitBlameSubmoduleCommit(toBlameRuntimeGitContext(file), { submodulePath, sha })
  )
}

export function loadBlameCommitMessage(file: InlineBlameFile, sha: string): Promise<string | null> {
  if (file.submodulePath) {
    return loadSubmoduleCommit(file, file.submodulePath, sha).then((commit) => commit.message)
  }
  return cached(messageCache, `${blameFileScopeKey(file)}\0${sha}`, async () => {
    const history = await getRuntimeGitHistory(toBlameRuntimeGitContext(file), {
      limit: 1,
      refs: [sha]
    })
    const item = history.items.find((candidate) => candidate.id === sha)
    return item?.message.trim() || null
  })
}

export function loadBlameCommitRemoteUrl(
  file: InlineBlameFile,
  sha: string
): Promise<string | null> {
  if (file.submodulePath) {
    return loadSubmoduleCommit(file, file.submodulePath, sha).then((commit) => commit.remoteUrl)
  }
  return cached(remoteUrlCache, `${blameFileScopeKey(file)}\0${sha}`, async () =>
    getRuntimeGitRemoteCommitUrl(toBlameRuntimeGitContext(file), { sha })
  )
}

/** The commit's diff of this file, narrowed to the change that introduced `originalLine`. */
export async function loadBlameLineHunk(
  file: InlineBlameFile,
  commit: GitBlameCommit,
  originalLine: number
): Promise<BlameHunk | null> {
  const diff = await cached(
    diffCache,
    `${blameFileScopeKey(file)}\0${commit.sha}\0${blameWorktreePath(file, commit.path)}`,
    () =>
      // Why worktree-relative: the commit-diff read routes a submodule's path into its repo.
      getRuntimeGitCommitDiff(toBlameRuntimeGitContext(file), {
        commitOid: commit.sha,
        parentOid: commit.previousSha ?? null,
        filePath: blameWorktreePath(file, commit.path),
        oldPath:
          commit.previousPath && commit.previousPath !== commit.path
            ? blameWorktreePath(file, commit.previousPath)
            : undefined
      }),
    MAX_CACHED_DIFFS
  )
  return diff.kind === 'text'
    ? findBlameLineHunk(diff.originalContent, diff.modifiedContent, originalLine)
    : null
}
