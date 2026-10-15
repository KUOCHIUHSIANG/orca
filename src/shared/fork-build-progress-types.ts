/** What a running fork sync/build is doing, for the status bar; `estimatedEndAt` null = can't guess. */
export type ForkBuildProgress = {
  phase: 'sync' | 'claude' | 'build' | 'restart'
  startedAt: number
  estimatedEndAt: number | null
}
