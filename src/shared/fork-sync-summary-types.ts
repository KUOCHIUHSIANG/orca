/** What an upstream sync handled on its own, shown once by the fork build it produced. */
export type ForkSyncSummary = {
  /** Identifies this summary text; dismissing it marks exactly this text as seen. */
  id: string
  version: string
  summary: string
}
