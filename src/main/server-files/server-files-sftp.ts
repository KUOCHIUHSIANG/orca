import type { FileEntryWithStats, Stats, TransferOptions } from 'ssh2'

type Done = (err?: Error | null) => void

/**
 * Every SFTP call the 伺服器 page may make. It deliberately has no chmod, chown or mode-setting
 * call: the page never changes permissions. ssh2's SFTPWrapper satisfies it; tests use a fake.
 */
export type ServerSftp = {
  readdir(
    path: string,
    callback: (err: Error | undefined, list: FileEntryWithStats[]) => void
  ): void
  stat(path: string, callback: (err: Error | undefined, stats: Stats) => void): void
  lstat(path: string, callback: (err: Error | undefined, stats: Stats) => void): void
  realpath(path: string, callback: (err: Error | undefined, absPath: string) => void): void
  mkdir(path: string, callback: Done): void
  rmdir(path: string, callback: Done): void
  unlink(path: string, callback: Done): void
  rename(from: string, to: string, callback: Done): void
  utimes(path: string, atime: number, mtime: number, callback: Done): void
  fastPut(localPath: string, remotePath: string, options: TransferOptions, callback: Done): void
  fastGet(remotePath: string, localPath: string, options: TransferOptions, callback: Done): void
  ext_openssh_statvfs(path: string, callback: (err: Error | undefined, info: unknown) => void): void
  end(): void
}

function settle<T>(run: (callback: (err: Error | null | undefined, value: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    run((err, value) => (err ? reject(err) : resolve(value)))
  })
}

function settleVoid(run: (callback: Done) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    run((err) => (err ? reject(err) : resolve()))
  })
}

export const sftpReaddir = (sftp: ServerSftp, path: string): Promise<FileEntryWithStats[]> =>
  settle((callback) => sftp.readdir(path, callback))

export const sftpStat = (sftp: ServerSftp, path: string): Promise<Stats> =>
  settle((callback) => sftp.stat(path, callback))

export const sftpLstat = (sftp: ServerSftp, path: string): Promise<Stats> =>
  settle((callback) => sftp.lstat(path, callback))

export const sftpRealpath = (sftp: ServerSftp, path: string): Promise<string> =>
  settle((callback) => sftp.realpath(path, callback))

export const sftpMkdir = (sftp: ServerSftp, path: string): Promise<void> =>
  settleVoid((callback) => sftp.mkdir(path, callback))

export const sftpRmdir = (sftp: ServerSftp, path: string): Promise<void> =>
  settleVoid((callback) => sftp.rmdir(path, callback))

export const sftpUnlink = (sftp: ServerSftp, path: string): Promise<void> =>
  settleVoid((callback) => sftp.unlink(path, callback))

export const sftpRename = (sftp: ServerSftp, from: string, to: string): Promise<void> =>
  settleVoid((callback) => sftp.rename(from, to, callback))

/** Seconds since the epoch, as SFTP v3 stores times. */
export const sftpSetModifiedTime = (
  sftp: ServerSftp,
  path: string,
  modifiedMs: number
): Promise<void> => {
  const seconds = Math.floor(modifiedMs / 1000)
  return settleVoid((callback) => sftp.utimes(path, seconds, seconds, callback))
}

export const sftpFastPut = (
  sftp: ServerSftp,
  localPath: string,
  remotePath: string,
  onStep: (transferred: number) => void
): Promise<void> =>
  settleVoid((callback) =>
    sftp.fastPut(localPath, remotePath, { step: (transferred) => onStep(transferred) }, callback)
  )

export const sftpFastGet = (
  sftp: ServerSftp,
  remotePath: string,
  localPath: string,
  onStep: (transferred: number) => void
): Promise<void> =>
  settleVoid((callback) =>
    sftp.fastGet(remotePath, localPath, { step: (transferred) => onStep(transferred) }, callback)
  )

export type FilesystemSpace = { freeBytes: number; readOnly: boolean }

const ST_RDONLY = 1

function asCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return typeof value === 'bigint' ? Number(value) : null
}

/** Null when the server lacks statvfs@openssh.com. */
export async function sftpFilesystemSpace(
  sftp: ServerSftp,
  path: string
): Promise<FilesystemSpace | null> {
  try {
    const info = await settle<unknown>((callback) => sftp.ext_openssh_statvfs(path, callback))
    if (typeof info !== 'object' || info === null) {
      return null
    }
    const record: Record<string, unknown> = { ...info }
    const available = asCount(record.f_bavail)
    const blockSize = asCount(record.f_frsize) || asCount(record.f_bsize)
    const flags = asCount(record.f_flag) ?? 0
    if (available === null || !blockSize) {
      return null
    }
    return { freeBytes: available * blockSize, readOnly: (flags & ST_RDONLY) !== 0 }
  } catch {
    return null
  }
}

export const SFTP_STATUS = {
  noSuchFile: 2,
  permissionDenied: 3,
  failure: 4,
  connectionLost: 7,
  unsupported: 8
} as const

export function sftpStatusCode(err: unknown): number | null {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'number') {
    return err.code
  }
  return null
}

export function isNoSuchFile(err: unknown): boolean {
  return sftpStatusCode(err) === SFTP_STATUS.noSuchFile
}
