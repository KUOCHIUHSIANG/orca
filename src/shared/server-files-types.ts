/** A server the 伺服器 page reaches over plain SSH/SFTP; nothing is ever installed on it. */
export type ServerEndpoint =
  | { kind: 'ssh-config'; alias: string }
  | { kind: 'manual'; host: string; port: number; username: string }

/** `auto`: ssh-agent plus whatever keys ~/.ssh/config or OpenSSH's defaults name. */
export type ServerAuthMethod = 'auto' | 'key' | 'password'

/** A project on the server: where it lives, where its backups go and what it runs as. */
export type ServerProject = {
  id: string
  name: string
  projectPath: string
  backupPath: string
  serviceName: string
  databaseName: string
}

/** `{專案}` `{資料庫}` `{服務}` `{日期}` placeholders are filled from the current project. */
export type ServerCommandTemplate = { id: string; label: string; command: string }

export type ServerProfile = {
  id: string
  label: string
  endpoint: ServerEndpoint
  auth: ServerAuthMethod
  identityFile: string
  /** Remote folder the page opens in; empty means the login's home. */
  startPath: string
  /** Local download folder; empty means ~/Downloads. */
  downloadDir: string
  protectedPaths: string[]
  projects: ServerProject[]
  commandTemplates: ServerCommandTemplate[]
}

export type ServerProfileSummary = ServerProfile & { hasSavedPassword: boolean }

/** `password`: undefined keeps the saved one, null forgets it. */
export type ServerProfileSaveRequest = { profile: ServerProfile; password?: string | null }

export type ServerFilesErrorCode =
  | 'permission-denied'
  | 'not-found'
  | 'no-space'
  | 'quota-exceeded'
  | 'read-only-filesystem'
  | 'already-exists'
  | 'protected'
  | 'unsupported-transport'
  | 'commands-unavailable'
  | 'auth-failed'
  | 'connection'
  | 'cancelled'
  | 'plan-expired'
  | 'invalid'
  | 'failure'

export type ServerFilesError = {
  code: ServerFilesErrorCode
  message: string
  /** The path the failing operation touched, when there was one. */
  path?: string
  /** The server's own words (SFTP status text or command stderr). */
  detail?: string
}

export type ServerFilesResult<T> = { ok: true; value: T } | { ok: false; error: ServerFilesError }

export type RemoteEntryKind = 'file' | 'directory' | 'symlink' | 'other'

/** Ownership and mode as the server reports them; names fall back to the numeric ids. */
export type RemoteNode = {
  mode: number
  uid: number
  gid: number
  owner: string
  group: string
}

export type RemoteEntry = RemoteNode & {
  name: string
  path: string
  kind: RemoteEntryKind
  /** Symlinks only: the link resolves to a folder, so it can be opened. */
  targetIsDirectory: boolean
  size: number
  modifiedMs: number
}

/** Who the login is on the server, from `id`. */
export type RemoteIdentity = {
  uid: number
  gids: number[]
  userName: string
  groupNames: string[]
}

export type ServerSessionInfo = {
  /** Null when the account can only use SFTP (no command execution). */
  identity: RemoteIdentity | null
  homePath: string
  /** Basename of the login shell, e.g. `bash`; null when unknown. */
  loginShell: string | null
  /** The profile's protected paths plus their symlink-resolved forms on this server. */
  protectedRoots: string[]
}

export type RemoteDirectoryState = {
  path: string
  node: RemoteNode | null
  /** Server-side `test -w && test -x`, which honours ACLs; null when commands can't run. */
  writable: boolean | null
  readOnlyFilesystem: boolean
  freeBytes: number | null
  entries: RemoteEntry[]
}

export type FileTimes = { size: number; modifiedMs: number }

export type TransferConflict = {
  relativePath: string
  destinationPath: string
  source: FileTimes
  destination: FileTimes
  newer: 'source' | 'destination' | 'same'
  /** Uploads: whether the server file can be overwritten per its mode; null when unknown. */
  writable: boolean | null
  protected: boolean
}

export type TransferPlan = {
  planId: string
  serverId: string
  direction: 'upload' | 'download'
  destinationDir: string
  fileCount: number
  totalBytes: number
  conflicts: TransferConflict[]
  /** Local symlinks are never followed on upload, so nothing unpicked leaves the machine. */
  skippedLinks: string[]
  /** Uploads: free space where the files land; null when the server doesn't say. */
  freeBytes: number | null
}

export type OverwritePolicy = 'overwrite' | 'skip' | 'newer' | 'each'

export type TransferExecuteRequest = {
  planId: string
  jobId: string
  policy: OverwritePolicy
  /** `each` only: conflicts (by relativePath) the user chose to overwrite. */
  overwrite: string[]
  /** The extra confirmation for overwriting files under protected paths. */
  protectedConfirmed: boolean
}

export type RemoveBlockReason =
  | 'protected'
  | 'protected-descendant'
  | 'parent-not-writable'
  | 'sticky-not-owner'
  | 'subfolder-not-writable'

export type RemovePlan = {
  /** Null when anything is blocked: nothing may be removed halfway. */
  planId: string | null
  serverId: string
  items: { path: string; kind: RemoteEntryKind; fileCount: number; folderCount: number }[]
  blocked: { path: string; reason: RemoveBlockReason }[]
}

export type CopyPlanRequest =
  | { kind: 'copy'; serverId: string; sources: string[]; destinationDir: string }
  | { kind: 'backup'; serverId: string; projectId: string; sources: string[] }

export type CopyItem = {
  source: string
  destination: string
  kind: 'file' | 'directory'
  destinationExists: boolean
  /** Exactly what runs on the server for this item. */
  command: string
}

export type CopyPlan = {
  planId: string
  serverId: string
  kind: 'copy' | 'backup'
  destinationRoot: string
  items: CopyItem[]
  /** Backups: what the backup folder already holds (often another project's last backup). */
  leftovers: { path: string; kind: RemoteEntryKind; modifiedMs: number }[]
  /** Why the leftovers can't be cleared from here, when they can't. */
  leftoversRefusal:
    | 'overlaps-project'
    | 'overlaps-protected'
    | 'home-or-root'
    | 'not-removable'
    | null
  protectedOverwrites: string[]
}

export type CopyExecuteRequest = {
  planId: string
  jobId: string
  clearLeftovers: boolean
  overwriteExisting: boolean
  protectedConfirmed: boolean
}

export type CopyVerification = {
  checkedFiles: number
  mismatches: { path: string; reason: 'missing' | 'size' | 'modified' }[]
}

export type JobWarning = {
  /** `times-not-preserved`: the server refused to set a file's modified time (not its owner). */
  code: 'times-not-preserved' | 'existing-kept'
  count: number
}

export type JobOutcome =
  | { status: 'done'; verification?: CopyVerification; warnings: JobWarning[] }
  | { status: 'cancelled' }

export type JobProgress = {
  jobId: string
  transferredBytes: number
  totalBytes: number
  completedFiles: number
  totalFiles: number
  currentPath: string | null
}
