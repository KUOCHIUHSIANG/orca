/** What Claude is fixing during the 'claude' phase; the commit fields place a conflict in the rebase. */
export type ForkBuildClaudeTask = {
  kind: 'conflict' | 'typecheck'
  commitIndex?: number
  commitCount?: number
  commitSubject?: string
}

/** What a running fork sync/build is doing, for the status bar; `estimatedEndAt` null = can't guess. */
export type ForkBuildProgress = {
  phase: 'sync' | 'claude' | 'build' | 'restart'
  startedAt: number
  estimatedEndAt: number | null
  claudeTask?: ForkBuildClaudeTask
}
