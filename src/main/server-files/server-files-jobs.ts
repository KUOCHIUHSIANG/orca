import { randomUUID } from 'node:crypto'
import type { JobProgress } from '../../shared/server-files-types'
import { fail } from './server-files-errors'

const PLAN_TTL_MS = 10 * 60_000
const MAX_PLANS = 20

/** Plans are built and kept by main; the renderer can only name one, so what it showed is what runs. */
export class PlanStore<T> {
  private readonly plans = new Map<string, { value: T; expiresAt: number }>()

  put(value: T, now = Date.now()): string {
    for (const [id, plan] of this.plans) {
      if (plan.expiresAt <= now) {
        this.plans.delete(id)
      }
    }
    while (this.plans.size >= MAX_PLANS) {
      const oldest = this.plans.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.plans.delete(oldest)
    }
    const id = randomUUID()
    this.plans.set(id, { value, expiresAt: now + PLAN_TTL_MS })
    return id
  }

  /** Single use: a confirmed plan can't be replayed. */
  take(planId: string, now = Date.now()): T {
    const plan = this.plans.get(planId)
    this.plans.delete(planId)
    if (!plan || plan.expiresAt <= now) {
      return fail('plan-expired', 'This confirmation has expired; start the action again')
    }
    return plan.value
  }

  discard(planId: string): void {
    this.plans.delete(planId)
  }
}

export class JobRegistry {
  private readonly jobs = new Map<string, AbortController>()

  start(jobId: string): AbortSignal {
    if (this.jobs.has(jobId)) {
      fail('invalid', 'This job is already running')
    }
    const controller = new AbortController()
    this.jobs.set(jobId, controller)
    return controller.signal
  }

  cancel(jobId: string): boolean {
    const controller = this.jobs.get(jobId)
    controller?.abort()
    return controller !== undefined
  }

  finish(jobId: string): void {
    this.jobs.delete(jobId)
  }
}

export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    fail('cancelled', 'Cancelled')
  }
}

const PROGRESS_INTERVAL_MS = 100

export type ProgressReporter = {
  startFile(path: string): void
  setFileBytes(bytes: number): void
  finishFile(): void
  flush(): void
  snapshot(): JobProgress
}

/** At most one progress event per 100 ms, plus one at every file boundary. */
export function createProgressReporter(
  base: Pick<JobProgress, 'jobId' | 'totalBytes' | 'totalFiles'>,
  emit: (progress: JobProgress) => void,
  now: () => number = Date.now
): ProgressReporter {
  let doneBytes = 0
  let fileBytes = 0
  let completedFiles = 0
  let currentPath: string | null = null
  let lastEmit = 0
  const snapshot = (): JobProgress => ({
    ...base,
    transferredBytes: doneBytes + fileBytes,
    completedFiles,
    currentPath
  })
  const flush = (): void => {
    lastEmit = now()
    emit(snapshot())
  }
  return {
    startFile(path) {
      currentPath = path
      fileBytes = 0
      flush()
    },
    setFileBytes(bytes) {
      fileBytes = bytes
      if (now() - lastEmit >= PROGRESS_INTERVAL_MS) {
        flush()
      }
    },
    finishFile() {
      doneBytes += fileBytes
      fileBytes = 0
      completedFiles += 1
      flush()
    },
    flush,
    snapshot
  }
}
