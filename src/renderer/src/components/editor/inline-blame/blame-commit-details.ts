import { getRuntimeGitCommitDiff } from '@/runtime/runtime-git-diff-client'
import { getRuntimeGitHistory } from '@/runtime/runtime-git-status-client'
import { getRuntimeGitRemoteCommitUrl } from '@/runtime/runtime-git-working-tree-client'
import type { GitBlameCommit } from '../../../../../shared/git-blame'
import type { GitDiffResult } from '../../../../../shared/git-diff-compare-types'
import { findBlameLineHunk, type BlameHunk } from './blame-line-hunk'
import {
  blameFileScopeKey,
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

export function loadBlameCommitMessage(file: InlineBlameFile, sha: string): Promise<string | null> {
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
    `${blameFileScopeKey(file)}\0${commit.sha}\0${commit.path}`,
    () =>
      getRuntimeGitCommitDiff(toBlameRuntimeGitContext(file), {
        commitOid: commit.sha,
        parentOid: commit.previousSha ?? null,
        filePath: commit.path,
        oldPath: commit.previousPath !== commit.path ? commit.previousPath : undefined
      }),
    MAX_CACHED_DIFFS
  )
  return diff.kind === 'text'
    ? findBlameLineHunk(diff.originalContent, diff.modifiedContent, originalLine)
    : null
}
