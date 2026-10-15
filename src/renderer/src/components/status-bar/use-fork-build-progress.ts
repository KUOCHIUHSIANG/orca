import { useEffect, useState } from 'react'
import type { ForkBuildProgress } from '../../../../shared/fork-build-progress-types'

/** The fork sync/build running right now, whoever started it; null otherwise and on web clients. */
export function useForkBuildProgress(): ForkBuildProgress | null {
  const [progress, setProgress] = useState<ForkBuildProgress | null>(null)
  useEffect(() => {
    // Why optional: web clients and status-bar tests have no fork bridge.
    const api = window.api?.forkSync
    if (!api) {
      return
    }
    let cancelled = false
    void api
      .getBuildProgress()
      .then((next) => {
        if (!cancelled) {
          setProgress(next)
        }
      })
      .catch(() => {})
    const stop = api.onBuildProgress(setProgress)
    return () => {
      cancelled = true
      stop()
    }
  }, [])
  return progress
}
