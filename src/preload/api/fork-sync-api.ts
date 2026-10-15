import type { ForkSyncSummary } from '../../shared/fork-sync-summary-types'

export type ForkSyncApi = {
  /** Null unless this fork build came from a sync whose summary has not been dismissed. */
  getSummary: () => Promise<ForkSyncSummary | null>
  dismissSummary: (id: string) => Promise<void>
}
