import { useEffect, useState } from 'react'
import { searchRuntimeRepoBaseRefDetails } from '@/runtime/runtime-repo-client'
import type { BaseRefSearchResult } from '../../../../../shared/repo-types'
import type { ExecutionHostId } from '../../../../../shared/execution-host'

const SEARCH_DEBOUNCE_MS = 200

/** Debounced local+remote branch search for the active repo; refs are newest-commit first. */
export function useRepoRefSearch({
  hostId,
  repoId,
  query,
  enabled,
  minQueryLength,
  limit,
  reloadToken = 0
}: {
  hostId: ExecutionHostId | undefined
  repoId: string | null
  query: string
  enabled: boolean
  minQueryLength: number
  limit: number
  reloadToken?: number
}): { results: BaseRefSearchResult[]; searching: boolean } {
  const [search, setSearch] = useState<{ key: string; refs: BaseRefSearchResult[] } | null>(null)
  const active = enabled && Boolean(repoId) && Boolean(hostId) && query.length >= minQueryLength
  const key = `${repoId}\0${query}\0${reloadToken}`

  useEffect(() => {
    if (!active || !repoId || !hostId) {
      return
    }
    let stale = false
    const timer = window.setTimeout(() => {
      void searchRuntimeRepoBaseRefDetails(hostId, repoId, query, limit)
        .then((refs) => {
          if (!stale) {
            setSearch({ key, refs })
          }
        })
        .catch(() => {
          if (!stale) {
            setSearch({ key, refs: [] })
          }
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [active, hostId, key, limit, query, repoId])

  if (!active) {
    return { results: [], searching: false }
  }
  if (search?.key === key) {
    return { results: search.refs, searching: false }
  }
  // Why: keep the previous list while typing or reloading so rows don't flicker away.
  const previous = search && search.key.startsWith(`${repoId}\0`) ? search.refs : []
  return { results: previous, searching: true }
}
