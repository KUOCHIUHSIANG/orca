import type {
  CopyExecuteRequest,
  CopyPlan,
  CopyPlanRequest,
  JobOutcome,
  JobProgress,
  RemoteDirectoryState,
  RemovePlan,
  ServerFilesResult,
  ServerProfileSaveRequest,
  ServerProfileSummary,
  ServerSessionInfo,
  TransferExecuteRequest,
  TransferPlan
} from '../../shared/server-files-types'

type Result<T> = Promise<ServerFilesResult<T>>

export type ServerFilesLocalShell = 'posix' | 'powershell' | 'cmd'

export type ServerFilesApi = {
  listProfiles: () => Result<ServerProfileSummary[]>
  canSavePasswords: () => Result<boolean>
  saveProfile: (request: ServerProfileSaveRequest) => Result<ServerProfileSummary>
  deleteProfile: (args: { serverId: string }) => Result<void>
  connect: (args: { serverId: string }) => Result<ServerSessionInfo>
  disconnect: (args: { serverId: string }) => Result<void>
  list: (args: { serverId: string; path: string }) => Result<RemoteDirectoryState>
  mkdir: (args: { serverId: string; parentDir: string; name: string }) => Result<string>
  rename: (args: { serverId: string; path: string; newName: string }) => Result<string>
  planUpload: (args: {
    serverId: string
    sources: string[]
    destinationDir: string
    mode: 'items' | 'contents'
  }) => Result<TransferPlan>
  planDownload: (args: {
    serverId: string
    sources: string[]
    destinationDir: string
  }) => Result<TransferPlan>
  executeTransfer: (request: TransferExecuteRequest) => Result<JobOutcome>
  planRemove: (args: { serverId: string; paths: string[] }) => Result<RemovePlan>
  executeRemove: (args: { planId: string; jobId: string }) => Result<JobOutcome>
  planCopy: (request: CopyPlanRequest) => Result<CopyPlan>
  executeCopy: (request: CopyExecuteRequest) => Result<JobOutcome>
  discardPlan: (args: { planId: string }) => Result<void>
  cancelJob: (args: { jobId: string }) => Result<boolean>
  terminalCommand: (args: {
    serverId: string
    cwd: string
    localShell: ServerFilesLocalShell
    prefill?: { command: string; hint: string }
  }) => Result<string>
  pickLocal: (args: {
    kind: 'files' | 'folders' | 'folder'
    defaultPath?: string
  }) => Result<string[]>
  localDefaults: () => Result<{ downloadsDir: string }>
  showInFolder: (args: { path: string }) => Result<void>
  /** Local path of a file dropped from Finder or Explorer. */
  getPathForFile: (file: File) => string
  onProgress: (callback: (progress: JobProgress) => void) => () => void
}
