import { toast } from 'sonner'
import type { JobOutcome, ServerFilesResult } from '../../../../shared/server-files-types'
import { useServerJobsStore, type ServerJob } from './server-files-jobs-store'
import { errorSummary } from './server-files-messages'
import { createBrowserUuid } from '@/lib/browser-uuid'

type JobStart = Pick<
  ServerJob,
  'serverId' | 'kind' | 'title' | 'localPath' | 'reveal' | 'retry'
> & {
  execute: (jobId: string) => Promise<ServerFilesResult<JobOutcome>>
}

/** Every transfer shows in the transfers list; failures also toast, naming the reason and path. */
export async function runServerJob(start: JobStart): Promise<JobOutcome | null> {
  const { execute, ...job } = start
  const jobId = createBrowserUuid()
  const jobs = useServerJobsStore.getState()
  jobs.addJob({ ...job, jobId })
  const result = await execute(jobId)
  if (result.ok) {
    useServerJobsStore.getState().finishJob(jobId, { outcome: result.value })
    return result.value
  }
  useServerJobsStore.getState().finishJob(jobId, { error: result.error })
  toast.error(errorSummary(result.error))
  return null
}

export function cancelServerJob(jobId: string): void {
  void window.api.serverFiles.cancelJob({ jobId })
}

/** The local path separator a folder uses, so joins look native on Windows too. */
export function joinLocalPath(folder: string, name: string): string {
  const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/'
  return folder.endsWith(separator) ? `${folder}${name}` : `${folder}${separator}${name}`
}
