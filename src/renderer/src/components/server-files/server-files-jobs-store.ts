import { create } from 'zustand'
import type {
  JobOutcome,
  JobProgress,
  ServerFilesError
} from '../../../../shared/server-files-types'

export type ServerJobKind = 'upload' | 'download' | 'remove' | 'copy' | 'backup'

export type ServerJob = {
  jobId: string
  serverId: string
  kind: ServerJobKind
  title: string
  status: 'running' | 'done' | 'failed' | 'cancelled'
  progress: JobProgress | null
  outcome: JobOutcome | null
  error: ServerFilesError | null
  startedAt: number
  /** When the latest progress arrived, for the transfer speed. */
  updatedAt: number
  /** Downloads: where the files landed, for "Show in Finder". */
  localPath?: string
  /** Backups: jump to the copies. */
  reveal?: () => void
  retry?: () => void
}

type JobsState = {
  jobs: ServerJob[]
  addJob: (
    job: Omit<ServerJob, 'status' | 'progress' | 'outcome' | 'error' | 'startedAt' | 'updatedAt'>
  ) => void
  setProgress: (progress: JobProgress) => void
  finishJob: (jobId: string, result: { outcome: JobOutcome } | { error: ServerFilesError }) => void
  clearFinished: () => void
}

const MAX_JOBS = 50

export const useServerJobsStore = create<JobsState>((set) => ({
  jobs: [],
  addJob: (job) =>
    set((state) => {
      const started: ServerJob = {
        ...job,
        status: 'running',
        progress: null,
        outcome: null,
        error: null,
        startedAt: Date.now(),
        updatedAt: Date.now()
      }
      return { jobs: [started, ...state.jobs].slice(0, MAX_JOBS) }
    }),
  setProgress: (progress) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.jobId === progress.jobId && job.status === 'running'
          ? { ...job, progress, updatedAt: Date.now() }
          : job
      )
    })),
  finishJob: (jobId, result) =>
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.jobId !== jobId) {
          return job
        }
        if ('error' in result) {
          return { ...job, status: 'failed', error: result.error }
        }
        return {
          ...job,
          status: result.outcome.status === 'cancelled' ? 'cancelled' : 'done',
          outcome: result.outcome
        }
      })
    })),
  clearFinished: () =>
    set((state) => ({ jobs: state.jobs.filter((job) => job.status === 'running') }))
}))
