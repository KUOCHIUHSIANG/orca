import { randomBytes } from 'node:crypto'
import { lstat, mkdir, rename, unlink, utimes } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { compareModifiedTimes } from '../../shared/server-files-overwrite-policy'
import { remoteBaseName } from '../../shared/server-files-paths'
import type { JobOutcome, TransferConflict } from '../../shared/server-files-types'
import { commandError, fail, sftpError, ServerFilesFailure } from './server-files-errors'
import { createProgressReporter, throwIfCancelled } from './server-files-jobs'
import { MAX_WALK_ENTRIES, walkRemoteTree } from './server-files-remote-walk'
import { sftpFastGet, sftpStat, sftpStatusCode, type ServerSftp } from './server-files-sftp'
import type { JobRun } from './server-files-upload'

export type DownloadFile = {
  remotePath: string
  localPath: string
  size: number
  modifiedMs: number
  conflict: TransferConflict | null
}

export type DownloadDraft = {
  destinationDir: string
  folders: string[]
  files: DownloadFile[]
  skippedLinks: string[]
}

const WINDOWS_RESERVED = /[<>:"\\|?*]/

function localStatsOrNull(path: string) {
  return lstat(path).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  })
}

function localPathFor(destinationDir: string, relativePath: string): string {
  const segments = relativePath.split('/')
  if (process.platform === 'win32' && segments.some((segment) => WINDOWS_RESERVED.test(segment))) {
    fail('invalid', 'This name cannot be saved on Windows', relativePath)
  }
  return join(destinationDir, ...segments)
}

/** Links to files are followed; links to folders are skipped so a link loop can't recurse forever. */
export async function draftDownload(
  sftp: ServerSftp,
  sources: readonly string[],
  destinationDir: string
): Promise<DownloadDraft> {
  const folders: string[] = []
  const files: DownloadFile[] = []
  const skippedLinks: string[] = []
  const budget = { remaining: MAX_WALK_ENTRIES }
  for (const source of sources) {
    const rootName = remoteBaseName(source)
    for (const entry of await walkRemoteTree(sftp, source, budget)) {
      const relativePath = entry.relativePath ? `${rootName}/${entry.relativePath}` : rootName
      const localPath = localPathFor(destinationDir, relativePath)
      let { kind, size, modifiedMs } = entry
      if (kind === 'symlink') {
        const target = await sftpStat(sftp, entry.path).catch(() => null)
        if (!target?.isFile()) {
          skippedLinks.push(entry.path)
          continue
        }
        kind = 'file'
        size = target.size
        modifiedMs = target.mtime * 1000
      }
      const existing = await localStatsOrNull(localPath)
      if (kind === 'directory') {
        if (existing && !existing.isDirectory()) {
          fail('already-exists', 'A file with this name exists where a folder goes', localPath)
        }
        if (!existing) {
          folders.push(localPath)
        }
        continue
      }
      if (kind !== 'file') {
        skippedLinks.push(entry.path)
        continue
      }
      if (existing && !existing.isFile()) {
        fail('already-exists', 'Something that is not a file has this name', localPath)
      }
      const source = { size, modifiedMs }
      const destination = existing ? { size: existing.size, modifiedMs: existing.mtimeMs } : null
      files.push({
        remotePath: entry.path,
        localPath,
        size,
        modifiedMs,
        conflict: destination
          ? {
              relativePath,
              destinationPath: localPath,
              source,
              destination,
              newer: compareModifiedTimes(source, destination),
              writable: null,
              protected: false
            }
          : null
      })
    }
  }
  return { destinationDir, folders, files, skippedLinks }
}

/** Each file lands in a hidden sibling first and replaces the target only once complete. */
export async function runDownload(
  run: JobRun,
  draft: DownloadDraft,
  files: readonly DownloadFile[]
): Promise<JobOutcome> {
  const { sftp, signal } = run
  const progress = createProgressReporter(
    {
      jobId: run.jobId,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      totalFiles: files.length
    },
    run.emit
  )
  for (const folder of draft.folders) {
    await mkdir(folder, { recursive: true })
  }
  for (const file of files) {
    throwIfCancelled(signal)
    progress.startFile(file.remotePath)
    const partial = join(
      dirname(file.localPath),
      `.${basename(file.localPath)}.${randomBytes(4).toString('hex')}.orca-download`
    )
    try {
      await sftpFastGet(sftp, file.remotePath, partial, (bytes) => progress.setFileBytes(bytes))
      const seconds = file.modifiedMs / 1000
      await utimes(partial, seconds, seconds).catch(() => undefined)
      await rename(partial, file.localPath)
    } catch (error) {
      await unlink(partial).catch(() => undefined)
      throwIfCancelled(signal)
      if (error instanceof ServerFilesFailure) {
        throw error
      }
      // Local failures (disk full, no access) carry Node's English errno text.
      throw new ServerFilesFailure(
        sftpStatusCode(error) !== null
          ? sftpError(error, file.remotePath)
          : commandError(error instanceof Error ? error.message : String(error), file.localPath)
      )
    }
    progress.setFileBytes(file.size)
    progress.finishFile()
  }
  return { status: 'done', warnings: [] }
}
