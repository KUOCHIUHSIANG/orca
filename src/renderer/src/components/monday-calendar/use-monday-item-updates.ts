import { useCallback, useEffect, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import type { MondayFailure, MondayUpdate } from '../../../../shared/monday-calendar-types'

// Why: reopening a task paints its last-seen discussion while the fresh copy loads.
const cachedUpdates = new Map<string, MondayUpdate[]>()

export type MondayItemUpdatesController = {
  updates: MondayUpdate[] | null
  loading: boolean
  error: MondayFailure | null
  refresh: () => void
}

export function useMondayItemUpdates(itemId: string): MondayItemUpdatesController {
  const mountedRef = useMountedRef()
  const [state, setState] = useState<{
    itemId: string
    updates: MondayUpdate[] | null
    loading: boolean
    error: MondayFailure | null
  }>(() => ({ itemId, updates: cachedUpdates.get(itemId) ?? null, loading: true, error: null }))

  const load = useCallback(
    async (targetId: string): Promise<void> => {
      setState({
        itemId: targetId,
        updates: cachedUpdates.get(targetId) ?? null,
        loading: true,
        error: null
      })
      let next: { updates?: MondayUpdate[]; error?: MondayFailure }
      try {
        const result = await window.api.monday.fetchItemUpdates({ itemId: targetId })
        next = result.ok ? { updates: result.updates } : { error: result }
      } catch (error) {
        next = { error: { ok: false, kind: 'api', message: readIpcErrorMessage(error) ?? '' } }
      }
      if (next.updates) {
        cachedUpdates.set(targetId, next.updates)
      }
      if (!mountedRef.current) {
        return
      }
      // Why: a slow response for a task the user already left must not overwrite the new one.
      setState((current) =>
        current.itemId === targetId
          ? {
              itemId: targetId,
              updates: next.updates ?? current.updates,
              loading: false,
              error: next.error ?? null
            }
          : current
      )
    },
    [mountedRef]
  )

  useEffect(() => {
    void load(itemId)
  }, [itemId, load])

  const current = state.itemId === itemId
  return {
    updates: current ? state.updates : (cachedUpdates.get(itemId) ?? null),
    loading: current ? state.loading : true,
    error: current ? state.error : null,
    refresh: () => void load(itemId)
  }
}
