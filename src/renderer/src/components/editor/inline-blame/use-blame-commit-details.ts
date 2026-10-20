import { useEffect, useState } from 'react'
import type { GitBlameCommit } from '../../../../../shared/git-blame'
import { loadBlameAuthorAvatar } from './blame-author-avatar'
import {
  loadBlameCommitMessage,
  loadBlameCommitRemoteUrl,
  loadBlameLineHunk
} from './blame-commit-details'
import type { BlameHunk } from './blame-line-hunk'
import type { InlineBlameFile } from './inline-blame-file'

/** `undefined` while a piece is still loading; each piece arrives independently. */
export type BlameCommitDetails = {
  message: string | null | undefined
  hunk: BlameHunk | null | undefined
  remoteUrl: string | null | undefined
  avatarUrl: string | null | undefined
}

const LOADING: BlameCommitDetails = {
  message: undefined,
  hunk: undefined,
  remoteUrl: undefined,
  avatarUrl: undefined
}

/** Loads what the hover card shows beyond the blame line; callers key the card per commit + line. */
export function useBlameCommitDetails(
  file: InlineBlameFile,
  commit: GitBlameCommit,
  originalLine: number
): BlameCommitDetails {
  const [details, setDetails] = useState<BlameCommitDetails>(LOADING)

  useEffect(() => {
    let stale = false
    const patch = (next: Partial<BlameCommitDetails>): void => {
      if (!stale) {
        setDetails((previous) => ({ ...previous, ...next }))
      }
    }
    if (file.submodulePath) {
      // Why: these reads run in the worktree's repo, which doesn't have the submodule's commits.
      patch({ message: null, hunk: null, remoteUrl: null })
      void loadBlameAuthorAvatar(commit.authorEmail, null).then((avatarUrl) => patch({ avatarUrl }))
      return () => {
        stale = true
      }
    }
    loadBlameCommitMessage(file, commit.sha).then(
      (message) => patch({ message }),
      () => patch({ message: null })
    )
    loadBlameLineHunk(file, commit, originalLine).then(
      (hunk) => patch({ hunk }),
      () => patch({ hunk: null })
    )
    void loadBlameCommitRemoteUrl(file, commit.sha)
      .catch(() => null)
      .then(async (remoteUrl) => {
        patch({ remoteUrl })
        patch({ avatarUrl: await loadBlameAuthorAvatar(commit.authorEmail, remoteUrl) })
      })
    return () => {
      stale = true
    }
  }, [commit, file, originalLine])

  return details
}
