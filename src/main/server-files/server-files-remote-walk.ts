import { joinRemotePath, remoteBaseName, remoteParentPath } from '../../shared/server-files-paths'
import type { RemoteEntryKind } from '../../shared/server-files-types'
import { entryKind } from './server-files-listing'
import { fail } from './server-files-errors'
import { sftpLstat, sftpReaddir, sftpRealpath, type ServerSftp } from './server-files-sftp'

export const MAX_WALK_ENTRIES = 50_000

export type WalkedEntry = {
  path: string
  /** Relative to the walk's root; '' for the root itself. */
  relativePath: string
  kind: RemoteEntryKind
  size: number
  modifiedMs: number
  mode: number
  uid: number
  gid: number
}

/** Pre-order, never following links: a link is listed but its target is never entered. */
export async function walkRemoteTree(
  sftp: ServerSftp,
  root: string,
  budget = { remaining: MAX_WALK_ENTRIES }
): Promise<WalkedEntry[]> {
  const rootStats = await sftpLstat(sftp, root)
  const entries: WalkedEntry[] = []
  const visit = async (
    path: string,
    relativePath: string,
    stats: { mode: number; uid: number; gid: number; size: number; mtime: number }
  ): Promise<void> => {
    budget.remaining -= 1
    if (budget.remaining < 0) {
      fail('invalid', `More than ${MAX_WALK_ENTRIES} items; pick fewer at a time`, root)
    }
    const kind = entryKind(stats.mode)
    entries.push({
      path,
      relativePath,
      kind,
      size: stats.size,
      modifiedMs: stats.mtime * 1000,
      mode: stats.mode,
      uid: stats.uid,
      gid: stats.gid
    })
    if (kind !== 'directory') {
      return
    }
    const children = await sftpReaddir(sftp, path)
    for (const child of children) {
      if (child.filename === '.' || child.filename === '..' || child.filename.includes('/')) {
        continue
      }
      await visit(
        joinRemotePath(path, child.filename),
        relativePath ? `${relativePath}/${child.filename}` : child.filename,
        child.attrs
      )
    }
  }
  await visit(root, '', rootStats)
  return entries
}

/** The path as the server resolves its folder, without following the last component. */
export async function canonicalRemotePath(sftp: ServerSftp, path: string): Promise<string> {
  try {
    const parent = await sftpRealpath(sftp, remoteParentPath(path))
    return joinRemotePath(parent, remoteBaseName(path))
  } catch {
    return path
  }
}

/** Drops paths already covered by another picked folder, so nothing is visited twice. */
export function outermostPaths(paths: readonly string[]): string[] {
  const unique = [...new Set(paths)].sort()
  return unique.filter(
    (path) => !unique.some((other) => other !== path && path.startsWith(`${other}/`))
  )
}
