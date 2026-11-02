import type { Stats } from 'ssh2'
import { quotePosixShell } from '../../shared/shell-argument-quoting'
import { joinRemotePath } from '../../shared/server-files-paths'
import type {
  RemoteDirectoryState,
  RemoteEntry,
  RemoteEntryKind,
  RemoteIdentity,
  RemoteNode
} from '../../shared/server-files-types'
import { sftpFilesystemSpace, sftpReaddir, sftpStat, type ServerSftp } from './server-files-sftp'

const TYPE_MASK = 0o170000
const LONGNAME_MODE = /^[-dlbcps][-rwxsStT]{9}[.+@]?$/

export function entryKind(mode: number): RemoteEntryKind {
  switch (mode & TYPE_MASK) {
    case 0o040000:
      return 'directory'
    case 0o100000:
      return 'file'
    case 0o120000:
      return 'symlink'
    default:
      return 'other'
  }
}

/** Owner and group names from an `ls -l` line (SFTP longname or `ls -ld`). */
export function parseLongnameOwners(line: string): { owner: string; group: string } | null {
  const fields = line.trim().split(/\s+/)
  if (fields.length < 4 || !LONGNAME_MODE.test(fields[0])) {
    return null
  }
  return { owner: fields[2], group: fields[3] }
}

/** `test -w` and `ls -ld` on the folder: the server's own answer, ACLs included. */
export function folderProbeCommand(path: string): string {
  const quoted = quotePosixShell(path)
  return `LC_ALL=C; export LC_ALL; if [ -w ${quoted} ] && [ -x ${quoted} ]; then echo w=1; else echo w=0; fi; ls -ld -- ${quoted}`
}

export function readFolderProbe(output: string): {
  writable: boolean | null
  owners: { owner: string; group: string } | null
} {
  const lines = output.split('\n')
  const flag = lines.find((line) => line.startsWith('w='))
  return {
    writable: flag === 'w=1' ? true : flag === 'w=0' ? false : null,
    owners: lines.map(parseLongnameOwners).find((owners) => owners !== null) ?? null
  }
}

type NameBook = { users: Map<number, string>; groups: Map<number, string> }

function nameBook(identity: RemoteIdentity | null): NameBook {
  const book: NameBook = { users: new Map(), groups: new Map() }
  if (identity) {
    book.users.set(identity.uid, identity.userName)
    identity.gids.forEach((gid, index) => {
      const name = identity.groupNames[index]
      if (name) {
        book.groups.set(gid, name)
      }
    })
  }
  return book
}

function toNode(stats: Stats, owners: { owner: string; group: string } | null, book: NameBook) {
  const node: RemoteNode = {
    mode: stats.mode,
    uid: stats.uid,
    gid: stats.gid,
    owner: owners?.owner ?? book.users.get(stats.uid) ?? String(stats.uid),
    group: owners?.group ?? book.groups.get(stats.gid) ?? String(stats.gid)
  }
  return node
}

async function symlinkPointsToFolder(sftp: ServerSftp, path: string): Promise<boolean> {
  try {
    return (await sftpStat(sftp, path)).isDirectory()
  } catch {
    return false
  }
}

export type ListDirectoryDeps = {
  sftp: ServerSftp
  identity: RemoteIdentity | null
  run: ((command: string) => Promise<string>) | null
}

export async function listRemoteDirectory(
  deps: ListDirectoryDeps,
  path: string
): Promise<RemoteDirectoryState> {
  const { sftp, identity, run } = deps
  const [list, folderStats, space, probe] = await Promise.all([
    sftpReaddir(sftp, path),
    sftpStat(sftp, path).catch(() => null),
    sftpFilesystemSpace(sftp, path),
    run ? run(folderProbeCommand(path)).then(readFolderProbe, () => null) : Promise.resolve(null)
  ])
  const book = nameBook(identity)
  const parsed = list
    .filter((item) => item.filename !== '.' && item.filename !== '..')
    .filter((item) => !item.filename.includes('/'))
    .map((item) => ({ item, owners: parseLongnameOwners(item.longname) }))
  for (const { item, owners } of parsed) {
    if (owners) {
      book.users.set(item.attrs.uid, owners.owner)
      book.groups.set(item.attrs.gid, owners.group)
    }
  }
  const entries: RemoteEntry[] = await Promise.all(
    parsed.map(async ({ item, owners }) => {
      const kind = entryKind(item.attrs.mode)
      const entryPath = joinRemotePath(path, item.filename)
      return {
        ...toNode(item.attrs, owners, book),
        name: item.filename,
        path: entryPath,
        kind,
        targetIsDirectory: kind === 'symlink' && (await symlinkPointsToFolder(sftp, entryPath)),
        size: item.attrs.size,
        modifiedMs: item.attrs.mtime * 1000
      }
    })
  )
  return {
    path,
    node: folderStats ? toNode(folderStats, probe?.owners ?? null, book) : null,
    writable: probe?.writable ?? null,
    readOnlyFilesystem: space?.readOnly ?? false,
    freeBytes: space?.freeBytes ?? null,
    entries
  }
}
