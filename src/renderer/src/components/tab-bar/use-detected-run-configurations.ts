import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { RunConfiguration } from '../../../../shared/run-configuration-types'
import { detectRunConfigurations } from '@/lib/run-configuration-detection'

/** Run configurations detected in the worktree's repo; null repoId means Run doesn't apply here. */
export function useDetectedRunConfigurations(worktreeId: string): {
  repoId: string | null
  configs: RunConfiguration[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const repos = useAppStore((s) => s.repos)
  const [configs, setConfigs] = useState<RunConfiguration[]>([])
  const [loading, setLoading] = useState(false)

  const repoId = useMemo(() => {
    if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      return null
    }
    const candidate = getRepoIdFromWorktreeId(worktreeId)
    return repos.some((r) => r.id === candidate) ? candidate : null
  }, [worktreeId, repos])

  const repoPath = useMemo(() => {
    if (!repoId) {
      return null
    }
    return repos.find((r) => r.id === repoId)?.path ?? null
  }, [repoId, repos])

  const refresh = useCallback(async () => {
    if (!repoPath) {
      return
    }
    setLoading(true)
    try {
      setConfigs(await detectRunConfigurations(repoPath))
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { repoId, configs, loading, refresh }
}
