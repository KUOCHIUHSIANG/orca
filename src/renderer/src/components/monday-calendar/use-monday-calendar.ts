import { useCallback, useEffect, useRef, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import type {
  MondayCalendarSnapshot,
  MondayConnectionStatus,
  MondayFailure,
  MondayPreferencesUpdate
} from '../../../../shared/monday-calendar-types'

// Why: kept outside React so re-entering the page paints the last result while the refresh runs.
let cachedSnapshot: MondayCalendarSnapshot | null = null

export type MondayCalendarController = {
  status: MondayConnectionStatus | null
  snapshot: MondayCalendarSnapshot | null
  loading: boolean
  error: MondayFailure | null
  refresh: () => void
  /** Fetches the calendar once per page visit; the docs tab never pays for it. */
  ensureLoaded: () => void
  applyConnectedStatus: (status: MondayConnectionStatus) => void
  disconnect: () => Promise<void>
  updatePreferences: (update: MondayPreferencesUpdate) => void
}

export function useMondayCalendar(): MondayCalendarController {
  const mountedRef = useMountedRef()
  const [status, setStatus] = useState<MondayConnectionStatus | null>(null)
  const [snapshot, setSnapshot] = useState<MondayCalendarSnapshot | null>(cachedSnapshot)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<MondayFailure | null>(null)
  const loadedRef = useRef(false)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.monday.fetchCalendar()
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        cachedSnapshot = result.snapshot
        setSnapshot(result.snapshot)
      } else {
        setError(result)
      }
    } catch (fetchError) {
      if (mountedRef.current) {
        setError({ ok: false, kind: 'api', message: readIpcErrorMessage(fetchError) ?? '' })
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    let cancelled = false
    void window.api.monday
      .status()
      .then((next) => {
        if (cancelled) {
          return
        }
        setStatus(next)
      })
      .catch((statusError: unknown) => {
        if (!cancelled) {
          setError({ ok: false, kind: 'api', message: readIpcErrorMessage(statusError) ?? '' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const ensureLoaded = useCallback((): void => {
    if (!loadedRef.current) {
      loadedRef.current = true
      void refresh()
    }
  }, [refresh])

  const applyConnectedStatus = useCallback(
    (next: MondayConnectionStatus): void => {
      // Why: boards may have changed, so the old snapshot can't stand in for the new one.
      cachedSnapshot = null
      setSnapshot(null)
      setStatus(next)
      loadedRef.current = next.activeTab === 'calendar'
      if (loadedRef.current) {
        void refresh()
      }
    },
    [refresh]
  )

  const disconnect = useCallback(async (): Promise<void> => {
    await window.api.monday.disconnect()
    cachedSnapshot = null
    if (mountedRef.current) {
      setSnapshot(null)
      setError(null)
      setStatus((current) =>
        current ? { ...current, connected: false, connectedAs: null } : current
      )
    }
  }, [mountedRef])

  const updatePreferences = useCallback((update: MondayPreferencesUpdate): void => {
    setStatus((current) => (current ? { ...current, ...update } : current))
    void window.api.monday.updatePreferences(update).catch((updateError: unknown) => {
      console.error('Failed to save Monday calendar preferences:', updateError)
    })
  }, [])

  return {
    status,
    snapshot,
    loading,
    error,
    refresh: () => void refresh(),
    ensureLoaded,
    applyConnectedStatus,
    disconnect,
    updatePreferences
  }
}
