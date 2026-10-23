import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getConnectionId } from '@/lib/connection-context'
import { branchName as stripHeadsPrefix } from '@/lib/git-utils'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { useWorktreesForRepo } from '@/store/selectors'
import {
  checkoutRuntimeGitBranch,
  createRuntimeGitBranch,
  listRuntimeGitLocalBranches
} from '@/runtime/runtime-git-branch-client'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import { getRepoExecutionHostId } from '../../../../../shared/execution-host'
import { getPublishTargetDisplayName } from '../../../../../shared/git-publish-target-status'
import type { RuntimeGitLocalBranches } from '../../../../../shared/runtime-worktree-contracts'
import { buildLocalBranchRows, buildRemoteBranchRows } from './git-branch-switcher-rows'
import { useGitToolWindowState } from './git-tool-window-state'
import type { GitToolWindowModel } from './use-git-tool-window'
import { useRepoRefSearch } from './use-repo-ref-search'

const REMOTE_SEARCH_LIMIT = 50

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')
}

/** State and actions behind the toolbar's branch dropdown: list, switch, create, fetch. */
export function useGitBranchSwitcher(model: GitToolWindowModel) {
  const { context, refreshAll, runRemoteAction } = model
  const { activeRepo, activeRepoTarget, activeWorktree, activeWorktreeId, worktreePath } = context
  const setLogRef = useGitToolWindowState((state) => state.setLogRef)
  const setSelectedCommit = useGitToolWindowState((state) => state.setSelectedCommit)
  const repoWorktrees = useWorktreesForRepo(activeRepo?.id ?? null)
  const [open, setOpenState] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [local, setLocal] = useState<{ key: string; data: RuntimeGitLocalBranches } | null>(null)
  const trimmedQuery = query.trim()
  const localKey = `${activeWorktreeId}\0${reloadToken}`

  const gitContext = useCallback((): RuntimeGitContext | null => {
    if (!activeWorktreeId || !worktreePath || !activeRepoTarget) {
      return null
    }
    return {
      // Why: route by the repo OWNER host, like every other Source Control mutation.
      target: activeRepoTarget,
      worktreeId: activeWorktreeId,
      worktreePath,
      connectionId: getConnectionId(activeWorktreeId) ?? undefined
    }
  }, [activeRepoTarget, activeWorktreeId, worktreePath])

  useEffect(() => {
    const ctx = open ? gitContext() : null
    if (!ctx) {
      return
    }
    let stale = false
    void listRuntimeGitLocalBranches(ctx)
      .then((data) => {
        if (!stale) {
          setLocal({ key: localKey, data })
        }
      })
      .catch((error: unknown) => {
        if (!stale) {
          setLocal({ key: localKey, data: { current: null, branches: [] } })
          toast.error(errorMessage(error))
        }
      })
    return () => {
      stale = true
    }
  }, [gitContext, localKey, open])

  const remoteSearch = useRepoRefSearch({
    hostId: activeRepo ? getRepoExecutionHostId(activeRepo) : undefined,
    repoId: activeRepo?.id ?? null,
    query: trimmedQuery,
    enabled: open && !creating,
    minQueryLength: 0,
    limit: REMOTE_SEARCH_LIMIT,
    reloadToken
  })

  const openElsewhere = useMemo(() => {
    const map = new Map<string, { worktreeId: string; label: string }>()
    for (const worktree of repoWorktrees) {
      if (worktree.id === activeWorktreeId || !worktree.branch) {
        continue
      }
      // Why: a twin project's other host has its own clone, so its checkouts don't block ours.
      if (activeWorktree?.hostId && worktree.hostId && worktree.hostId !== activeWorktree.hostId) {
        continue
      }
      map.set(stripHeadsPrefix(worktree.branch), {
        worktreeId: worktree.id,
        label: worktree.displayName
      })
    }
    return map
  }, [activeWorktree?.hostId, activeWorktreeId, repoWorktrees])

  const localData = local?.key === localKey ? local.data : (local?.data ?? null)
  const localBranches = localData?.branches ?? []
  const localRows = buildLocalBranchRows(
    localBranches,
    localData?.current ?? null,
    trimmedQuery,
    openElsewhere
  )
  const remoteRows = localData ? buildRemoteBranchRows(remoteSearch.results, localBranches) : []
  const loading = localData === null || (remoteSearch.searching && remoteRows.length === 0)

  const setOpen = useCallback((next: boolean): void => {
    setOpenState(next)
    if (!next) {
      setQuery('')
      setCreating(false)
      setNewBranchName('')
    }
  }, [])

  const run = useCallback(
    async (
      branch: string,
      operation: (ctx: RuntimeGitContext, branch: string) => Promise<void>
    ): Promise<void> => {
      const ctx = gitContext()
      const state = useAppStore.getState()
      if (!ctx || !activeWorktreeId || state.isRemoteOperationActive) {
        return
      }
      setPending(branch)
      state.beginRemoteOperation()
      try {
        await operation(ctx, branch)
        // Why: the log's ref override and selected commit belong to the branch we just left.
        setLogRef(activeWorktreeId, null)
        setSelectedCommit(activeWorktreeId, null)
        setOpen(false)
      } catch (error) {
        toast.error(errorMessage(error))
      } finally {
        useAppStore.getState().endRemoteOperation()
        setPending(null)
        setReloadToken((token) => token + 1)
        refreshAll()
      }
    },
    [activeWorktreeId, gitContext, refreshAll, setLogRef, setOpen, setSelectedCommit]
  )

  const checkout = useCallback(
    (branch: string): void => {
      void run(branch, checkoutRuntimeGitBranch)
    },
    [run]
  )

  const createBranch = useCallback((): void => {
    const branch = newBranchName.trim()
    if (branch) {
      void run(branch, createRuntimeGitBranch)
    }
  }, [newBranchName, run])

  const startCreate = useCallback((): void => {
    setNewBranchName(trimmedQuery)
    setCreating(true)
  }, [trimmedQuery])

  const openWorktree = useCallback(
    (worktreeId: string): void => {
      setOpen(false)
      activateAndRevealWorktree(worktreeId)
    },
    [setOpen]
  )

  const fetchRemotes = useCallback(async (): Promise<void> => {
    await runRemoteAction('fetch')
    setReloadToken((token) => token + 1)
  }, [runRemoteAction])

  const pushTarget = activeWorktree?.pushTarget
  return {
    pushTargetLabel: pushTarget ? getPublishTargetDisplayName(pushTarget) : null,
    open,
    setOpen,
    query,
    setQuery,
    trimmedQuery,
    creating,
    setCreating,
    newBranchName,
    setNewBranchName,
    pending,
    loading,
    localRows,
    remoteRows,
    checkout,
    createBranch,
    startCreate,
    openWorktree,
    fetchRemotes
  }
}

export type GitBranchSwitcherModel = ReturnType<typeof useGitBranchSwitcher>
