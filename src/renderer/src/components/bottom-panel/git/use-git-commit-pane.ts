import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getConnectionId } from '@/lib/connection-context'
import { commitRuntimeGit } from '@/runtime/runtime-git-sync-client'
import {
  bulkStageRuntimeGitPaths,
  bulkUnstageRuntimeGitPaths
} from '@/runtime/runtime-git-working-tree-client'
import { resolveCommitDisabledReason } from '../../right-sidebar/source-control-commit-eligibility'
import {
  buildGitChangeRows,
  stagedPathsForUnstage,
  summarizeGitChangeRows,
  type GitChangeRow
} from './git-change-rows'
import { useGitToolWindowState } from './git-tool-window-state'
import type { GitToolWindowModel } from './use-git-tool-window'

/** The commit pane: checkbox rows backed by the git index, the message draft, and Commit. */
export function useGitCommitPane(model: GitToolWindowModel) {
  const { context, entryMutations, refreshActiveGitStatusAfterMutation, refreshGitHistoryRef } =
    model
  const { activeRepoTarget, activeWorktreeId, entries, isRemoteOperationActive, worktreePath } =
    context
  const rows = useMemo(() => buildGitChangeRows(entries), [entries])
  const summary = useMemo(() => summarizeGitChangeRows(rows), [rows])
  const message = useGitToolWindowState((state) =>
    activeWorktreeId ? (state.commitDrafts[activeWorktreeId] ?? '') : ''
  )
  const setCommitDraft = useGitToolWindowState((state) => state.setCommitDraft)
  const [committingWorktreeId, setCommittingWorktreeId] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<{ worktreeId: string; message: string } | null>(
    null
  )
  const [pendingPaths, setPendingPaths] = useState<ReadonlySet<string>>(() => new Set())
  // Why: concurrent `git add`/`git reset` race on index.lock, so index writes run one at a time.
  const indexQueueRef = useRef<Promise<void>>(Promise.resolve())

  const runtimeContext = useCallback(
    () =>
      activeWorktreeId && worktreePath && activeRepoTarget
        ? {
            target: activeRepoTarget,
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId: getConnectionId(activeWorktreeId) ?? undefined
          }
        : null,
    [activeRepoTarget, activeWorktreeId, worktreePath]
  )

  const enqueueIndexWrite = useCallback((paths: string[], write: () => Promise<void>) => {
    setPendingPaths((prev) => new Set([...prev, ...paths]))
    const run = indexQueueRef.current.then(write).finally(() => {
      setPendingPaths((prev) => {
        const next = new Set(prev)
        for (const path of paths) {
          next.delete(path)
        }
        return next
      })
    })
    indexQueueRef.current = run.catch(() => undefined)
    return run
  }, [])

  const toggleRow = useCallback(
    (row: GitChangeRow): void => {
      if (row.conflicted) {
        return
      }
      void enqueueIndexWrite([row.path], () =>
        row.checked === true
          ? entryMutations.handleUnstage(row.path, row.staged?.oldPath)
          : entryMutations.handleStage(row.path)
      )
    },
    [enqueueIndexWrite, entryMutations]
  )

  const toggleAll = useCallback((): void => {
    const target = runtimeContext()
    if (!target) {
      return
    }
    const unstage = summary.checked === true
    const paths = unstage
      ? stagedPathsForUnstage(rows)
      : rows.filter((row) => !row.conflicted && row.checked !== true).map((row) => row.path)
    if (paths.length === 0) {
      return
    }
    void enqueueIndexWrite(
      rows.map((row) => row.path),
      async () => {
        try {
          await (unstage
            ? bulkUnstageRuntimeGitPaths(target, paths)
            : bulkStageRuntimeGitPaths(target, paths))
        } catch (error) {
          toast.error(unstage ? 'Failed to unstage files' : 'Failed to stage files', {
            description: error instanceof Error ? error.message : undefined
          })
        }
        await refreshActiveGitStatusAfterMutation()
      }
    )
  }, [
    enqueueIndexWrite,
    refreshActiveGitStatusAfterMutation,
    rows,
    runtimeContext,
    summary.checked
  ])

  const setMessage = useCallback(
    (next: string): void => {
      if (activeWorktreeId) {
        setCommitDraft(activeWorktreeId, next)
      }
    },
    [activeWorktreeId, setCommitDraft]
  )

  const isCommitting = committingWorktreeId !== null && committingWorktreeId === activeWorktreeId
  const disabledReason = resolveCommitDisabledReason({
    stagedCount: summary.stagedCount,
    hasPartiallyStagedChanges: summary.hasPartiallyStaged,
    hasMessage: message.trim().length > 0,
    hasUnresolvedConflicts: summary.conflictCount > 0
  })
  const canCommit =
    disabledReason === null && !isCommitting && !isRemoteOperationActive && pendingPaths.size === 0

  const commit = useCallback(async (): Promise<void> => {
    const target = runtimeContext()
    const trimmed = message.trim()
    if (!target || !canCommit || !trimmed) {
      return
    }
    setCommittingWorktreeId(target.worktreeId)
    setCommitError(null)
    try {
      const result = await commitRuntimeGit(target, trimmed)
      if (!result.success) {
        setCommitError({ worktreeId: target.worktreeId, message: result.error ?? 'Commit failed' })
        return
      }
      // Why: the field stays editable mid-commit; keep anything typed after Commit was pressed.
      const current = useGitToolWindowState.getState().commitDrafts[target.worktreeId] ?? ''
      if (current.trim() === trimmed) {
        setCommitDraft(target.worktreeId, '')
      }
    } catch (error) {
      setCommitError({
        worktreeId: target.worktreeId,
        message: error instanceof Error ? error.message : 'Commit failed'
      })
    } finally {
      setCommittingWorktreeId(null)
      void refreshActiveGitStatusAfterMutation()
      void refreshGitHistoryRef.current()
    }
  }, [
    canCommit,
    message,
    refreshActiveGitStatusAfterMutation,
    refreshGitHistoryRef,
    runtimeContext,
    setCommitDraft
  ])

  return {
    rows,
    summary,
    message,
    setMessage,
    pendingPaths,
    toggleRow,
    toggleAll,
    commit,
    canCommit,
    isCommitting,
    disabledReason,
    commitError: commitError?.worktreeId === activeWorktreeId ? commitError.message : null
  }
}
