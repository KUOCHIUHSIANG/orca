import type { ServerFilesError, ServerFilesErrorCode } from '../../shared/server-files-types'
import {
  SFTP_STATUS,
  sftpFilesystemSpace,
  sftpStatusCode,
  type ServerSftp
} from './server-files-sftp'

export class ServerFilesFailure extends Error {
  readonly failure: ServerFilesError

  constructor(failure: ServerFilesError) {
    super(failure.message)
    this.name = 'ServerFilesFailure'
    this.failure = failure
  }
}

export function fail(code: ServerFilesErrorCode, message: string, path?: string): never {
  throw new ServerFilesFailure({ code, message, ...(path ? { path } : {}) })
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const STATUS_ERRORS: Partial<Record<number, { code: ServerFilesErrorCode; message: string }>> = {
  [SFTP_STATUS.permissionDenied]: { code: 'permission-denied', message: 'Permission denied' },
  [SFTP_STATUS.noSuchFile]: { code: 'not-found', message: 'No such file or folder' },
  [SFTP_STATUS.connectionLost]: { code: 'connection', message: 'Connection lost' },
  [SFTP_STATUS.failure]: { code: 'failure', message: 'The server reported a failure' }
}

export function sftpError(error: unknown, path?: string): ServerFilesError {
  const detail = errorText(error)
  const status = sftpStatusCode(error)
  const known = status === null ? undefined : STATUS_ERRORS[status]
  return {
    code: known?.code ?? 'failure',
    message: known?.message ?? detail,
    detail,
    ...(path ? { path } : {})
  }
}

/**
 * SFTP v3 has no "disk full" status: sftp-server answers a plain Failure. Re-reading the free
 * space tells the user whether that is what happened instead of leaving a bare "Failure".
 */
export async function diagnoseWriteError(
  sftp: ServerSftp,
  directory: string,
  error: unknown,
  path: string
): Promise<ServerFilesError> {
  const mapped = sftpError(error, path)
  if (mapped.code !== 'failure') {
    return mapped
  }
  const space = await sftpFilesystemSpace(sftp, directory)
  if (space?.readOnly) {
    return { ...mapped, code: 'read-only-filesystem', message: 'Read-only file system' }
  }
  if (space && space.freeBytes < 64 * 1024) {
    return { ...mapped, code: 'no-space', message: 'No space left on device' }
  }
  return mapped
}

const COMMAND_PATTERNS: [RegExp, ServerFilesErrorCode][] = [
  [/permission denied|operation not permitted/i, 'permission-denied'],
  [/no space left on device/i, 'no-space'],
  [/disk quota exceeded/i, 'quota-exceeded'],
  [/read-only file system/i, 'read-only-filesystem'],
  [/no such file or directory/i, 'not-found'],
  [/file exists/i, 'already-exists']
]

/** Commands run with LC_ALL=C, so their stderr is in English and these phrases are stable. */
export function commandError(stderr: string, path?: string): ServerFilesError {
  const detail = stderr.trim()
  const code = COMMAND_PATTERNS.find(([pattern]) => pattern.test(detail))?.[1] ?? 'failure'
  return {
    code,
    message: detail.split('\n')[0] || 'The command failed',
    detail,
    ...(path ? { path } : {})
  }
}

export function toServerFilesError(error: unknown): ServerFilesError {
  if (error instanceof ServerFilesFailure) {
    return error.failure
  }
  if (sftpStatusCode(error) !== null) {
    return sftpError(error)
  }
  const message = errorText(error)
  if (/authentication|auth fail|all configured authentication methods failed/i.test(message)) {
    return { code: 'auth-failed', message }
  }
  if (/cancel/i.test(message) || (error instanceof Error && error.name === 'AbortError')) {
    return { code: 'cancelled', message }
  }
  if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|connection|timed out/i.test(message)) {
    return { code: 'connection', message }
  }
  return { code: 'failure', message }
}
