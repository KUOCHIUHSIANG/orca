import type { ForkBuildProgress } from '../../shared/fork-build-progress-types'
import type { ForkSyncSummary } from '../../shared/fork-sync-summary-types'

export type ForkSyncApi = {
  /** Null unless this fork build came from a sync whose summary has not been dismissed. */
  getSummary: () => Promise<ForkSyncSummary | null>
  dismissSummary: (id: string) => Promise<void>
  /** Null unless a fork sync/build is running right now. */
  getBuildProgress: () => Promise<ForkBuildProgress | null>
  onBuildProgress: (callback: (progress: ForkBuildProgress | null) => void) => () => void
}
