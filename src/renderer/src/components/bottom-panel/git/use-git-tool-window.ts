import { useCallback, useEffect, useRef, useState } from 'react'
import { getConnectionId } from '@/lib/connection-context'
import { useAppStore } from '@/store'
import { GIT_HISTORY_DEFAULT_LIMIT, GIT_HISTORY_MAX_LIMIT } from '../../../../../shared/git-history'
import { useSourceControlWorktreeContext } from '../../right-sidebar/source-control/listing/use-worktree-context'
import { useSourceControlRowOpening } from '../../right-sidebar/source-control/listing/use-row-opening'
import type { FlatEntry } from '../../right-sidebar/source-control/listing/use-selection'
import { useSourceControlEntryMutations } from '../../right-sidebar/source-control/commit/use-entry-mutations'
import { useSourceControlGitHistory } from '../../right-sidebar/source-control/sync/use-git-history'
import { useGitHistoryCommitActions } from '../../right-sidebar/source-control/sync/use-git-history-commit-actions'
import { useSourceControlStatusRefresh } from '../../right-sidebar/source-control/sync/use-status-refresh'
import { useSourceControlUpstreamStatusFetch } from '../../right-sidebar/source-control/sync/use-upstream-status-fetch'
import { useGitToolWindowState } from './git-tool-window-state'

export type GitToolWindowRemoteAction = 'fetch' | 'pull' | 'push'

const NO_SELECTION_ENTRIES: FlatEntry[] = []
// Why @{upstream}: resolves host-side without knowing the name, and drops out when there is none.
const CURRENT_BRANCH_LOG_REFS = ['HEAD', 'HEAD@{upstream}']
const IS_MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** Everything the bottom panel's Git tab reads and does for the active worktree; mounted only while shown. */
export function useGitToolWindow() {
  const context = useSourceControlWorktreeContext()
  const {
    activeGitStatusHead,
    activeRepoTarget,
    activeWorktree,
    activeWorktreeId,
    activeConnectionId,
    activeWorktreeInstanceId,
    isFolder,
    remoteStatus,
    repositoryHuge,
    worktreeMap,
    worktreePath
  } = context
  const logRef = useGitToolWindowState((state) =>
    activeWorktreeId ? (state.logRefByWorktree[activeWorktreeId] ?? null) : null
  )
  // Why: a deeper page belongs to the log it was loaded for; switching worktree or ref starts over.
  const limitScope = `${activeWorktreeId}\0${logRef}`
  const [loadedPage, setLoadedPage] = useState({
    scope: limitScope,
    limit: GIT_HISTORY_DEFAULT_LIMIT
  })
  const limit = loadedPage.scope === limitScope ? loadedPage.limit : GIT_HISTORY_DEFAULT_LIMIT

  const statusRefresh = useSourceControlStatusRefresh({
    activeRepoTarget,
    activeWorktreeId,
    worktreePath,
    activePushTarget: activeWorktree?.pushTarget,
    isFolder,
    repositoryHuge,
    activeConnectionId,
    activeWorktreeInstanceId,
    worktreeMap
  })
  const { refreshActiveGitStatusAfterMutation } = statusRefresh
  const entryMutations = useSourceControlEntryMutations({
    activeRepoTarget,
    activeWorktreeId,
    worktreePath,
    refreshActiveGitStatusAfterMutation
  })
  const history = useSourceControlGitHistory({
    activeRepoTarget,
    activeWorktreeId,
    worktreePath,
    compareBaseRef: null,
    isFolder,
    isBranchVisible: true,
    isGitHistoryExpanded: true,
    isGitHistoryVisible: true,
    worktreeMap,
    limit,
    refs: logRef ? [logRef] : CURRENT_BRANCH_LOG_REFS
  })
  const { refreshGitHistoryRef } = history
  const rowOpening = useSourceControlRowOpening({
    isMac: IS_MAC,
    activeWorktreeId,
    worktreePath,
    visibleSelectionEntries: NO_SELECTION_ENTRIES,
    branchSummary: null
  })
  const commitActions = useGitHistoryCommitActions({
    activeWorktreeId,
    worktreePath,
    activeRepoTarget,
    resolveSplitTargetGroupId: rowOpening.resolveSplitTargetGroupId
  })
  useSourceControlUpstreamStatusFetch({
    activeRepoTarget,
    activeWorktree,
    activeWorktreeId,
    fetchUpstreamStatus: useAppStore.getState().fetchUpstreamStatus,
    isBranchVisible: true,
    isFolder,
    worktreePath
  })

  // Why: commits, pulls and fetches made outside this tab (terminal, sidebar) move HEAD or the upstream.
  const historyTrigger = `${activeWorktreeId}\0${activeGitStatusHead ?? ''}\0${remoteStatus?.upstreamName ?? ''}\0${remoteStatus?.ahead ?? ''}\0${remoteStatus?.behind ?? ''}`
  const lastHistoryTriggerRef = useRef<string | null>(null)
  useEffect(() => {
    const previous = lastHistoryTriggerRef.current
    lastHistoryTriggerRef.current = historyTrigger
    // The history hook loads on its own when the worktree first shows; only react to later moves.
    if (previous === null || previous === historyTrigger) {
      return
    }
    if (previous.split('\0')[0] !== historyTrigger.split('\0')[0]) {
      return
    }
    void refreshGitHistoryRef.current()
  }, [historyTrigger, refreshGitHistoryRef])

  const refreshAll = useCallback((): void => {
    void refreshActiveGitStatusAfterMutation()
    void refreshGitHistoryRef.current()
  }, [refreshActiveGitStatusAfterMutation, refreshGitHistoryRef])

  const runRemoteAction = useCallback(
    async (kind: GitToolWindowRemoteAction): Promise<void> => {
      const state = useAppStore.getState()
      if (!activeWorktreeId || !worktreePath || state.isRemoteOperationActive) {
        return
      }
      const connectionId = getConnectionId(activeWorktreeId) ?? undefined
      const pushTarget = activeWorktree?.pushTarget
      const options = { runtimeTarget: activeRepoTarget }
      try {
        if (kind === 'fetch') {
          await state.fetchBranch(activeWorktreeId, worktreePath, connectionId, pushTarget, options)
        } else if (kind === 'pull') {
          await state.pullBranch(activeWorktreeId, worktreePath, connectionId, pushTarget, options)
        } else {
          const publish =
            remoteStatus?.hasUpstream === false && !remoteStatus.hasConfiguredPushTarget
          await state.pushBranch(
            activeWorktreeId,
            worktreePath,
            publish,
            connectionId,
            pushTarget,
            options
          )
        }
      } catch {
        // The store actions already toast the failure.
      } finally {
        refreshAll()
      }
    },
    [
      activeRepoTarget,
      activeWorktree?.pushTarget,
      activeWorktreeId,
      refreshAll,
      remoteStatus,
      worktreePath
    ]
  )

  const loadMore = useCallback((): void => {
    setLoadedPage({
      scope: limitScope,
      limit: Math.min(GIT_HISTORY_MAX_LIMIT, limit + GIT_HISTORY_DEFAULT_LIMIT)
    })
  }, [limit, limitScope])

  return {
    context,
    entryMutations,
    gitHistoryState: history.gitHistoryState,
    logRef,
    limit,
    loadMore,
    refreshAll,
    refreshActiveGitStatusAfterMutation,
    refreshGitHistoryRef,
    runRemoteAction,
    handleOpenDiff: rowOpening.handleOpenDiff,
    ...commitActions
  }
}

export type GitToolWindowModel = ReturnType<typeof useGitToolWindow>
