import { findProtectedDescendant, findProtectedRoot } from './server-files-paths'
import type {
  RemoteDirectoryState,
  RemoteEntry,
  RemoteIdentity,
  RemoteNode
} from './server-files-types'

export type PermissionAnswer = 'yes' | 'no' | 'unknown'

export type AccessDenyReason =
  | 'no-selection'
  | 'protected'
  | 'protected-descendant'
  | 'folder-not-writable'
  | 'read-only-filesystem'
  | 'sticky-not-owner'
  | 'not-readable'

export type AccessVerdict =
  | { state: 'allowed' }
  | { state: 'unknown' }
  | { state: 'denied'; reason: AccessDenyReason; path: string }

const READ = 4
const WRITE = 2
const SEARCH = 1
const STICKY = 0o1000

const ALLOWED: AccessVerdict = { state: 'allowed' }
const UNKNOWN: AccessVerdict = { state: 'unknown' }

/** POSIX class check: the first matching class (owner, group, other) decides, as the kernel does. */
export type PermissionBits = Pick<RemoteNode, 'mode' | 'uid' | 'gid'>

export function hasPermission(
  identity: RemoteIdentity | null,
  node: PermissionBits,
  bit: number
): PermissionAnswer {
  if (!identity) {
    return 'unknown'
  }
  if (identity.uid === 0) {
    return 'yes'
  }
  const shift = node.uid === identity.uid ? 6 : identity.gids.includes(node.gid) ? 3 : 0
  return (node.mode >> shift) & bit ? 'yes' : 'no'
}

function both(first: PermissionAnswer, second: PermissionAnswer): PermissionAnswer {
  if (first === 'no' || second === 'no') {
    return 'no'
  }
  return first === 'yes' && second === 'yes' ? 'yes' : 'unknown'
}

/** Creating, deleting or renaming entries needs write and search on the folder itself. */
export function canChangeFolder(
  folder: RemoteDirectoryState,
  identity: RemoteIdentity | null
): AccessVerdict {
  if (folder.readOnlyFilesystem) {
    return { state: 'denied', reason: 'read-only-filesystem', path: folder.path }
  }
  const answer =
    folder.writable !== null
      ? folder.writable
        ? 'yes'
        : 'no'
      : folder.node
        ? both(
            hasPermission(identity, folder.node, WRITE),
            hasPermission(identity, folder.node, SEARCH)
          )
        : 'unknown'
  if (answer === 'no') {
    return { state: 'denied', reason: 'folder-not-writable', path: folder.path }
  }
  return answer === 'yes' ? ALLOWED : UNKNOWN
}

/** Linux decides deletion by the PARENT folder, plus ownership when that folder is sticky (/tmp). */
export function canRemoveOrRename(
  folder: RemoteDirectoryState,
  entries: readonly RemoteEntry[],
  identity: RemoteIdentity | null,
  protectedRoots: readonly string[]
): AccessVerdict {
  if (entries.length === 0) {
    return { state: 'denied', reason: 'no-selection', path: folder.path }
  }
  for (const entry of entries) {
    if (findProtectedRoot(entry.path, protectedRoots)) {
      return { state: 'denied', reason: 'protected', path: entry.path }
    }
    if (findProtectedDescendant(entry.path, protectedRoots)) {
      return { state: 'denied', reason: 'protected-descendant', path: entry.path }
    }
  }
  const folderVerdict = canChangeFolder(folder, identity)
  if (folderVerdict.state === 'denied') {
    return folderVerdict
  }
  const sticky = folder.node !== null && (folder.node.mode & STICKY) !== 0
  if (sticky && identity && identity.uid !== 0 && folder.node?.uid !== identity.uid) {
    const foreign = entries.find((entry) => entry.uid !== identity.uid)
    if (foreign) {
      return { state: 'denied', reason: 'sticky-not-owner', path: foreign.path }
    }
  }
  return folderVerdict
}

/** Downloading or copying out needs read on files and read+search on folders. */
export function canReadEntries(
  folder: RemoteDirectoryState,
  entries: readonly RemoteEntry[],
  identity: RemoteIdentity | null
): AccessVerdict {
  if (entries.length === 0) {
    return { state: 'denied', reason: 'no-selection', path: folder.path }
  }
  let sawUnknown = false
  for (const entry of entries) {
    // Symlinks are judged by their target, which the listing doesn't stat; the server decides.
    if (entry.kind === 'symlink') {
      sawUnknown = true
      continue
    }
    const answer =
      entry.kind === 'directory'
        ? both(hasPermission(identity, entry, READ), hasPermission(identity, entry, SEARCH))
        : hasPermission(identity, entry, READ)
    if (answer === 'no') {
      return { state: 'denied', reason: 'not-readable', path: entry.path }
    }
    sawUnknown ||= answer === 'unknown'
  }
  return sawUnknown ? UNKNOWN : ALLOWED
}

/** In-place overwrite (what uploads do) needs write on the existing file itself. */
export function canOverwriteFile(
  identity: RemoteIdentity | null,
  node: PermissionBits
): boolean | null {
  const answer = hasPermission(identity, node, WRITE)
  return answer === 'unknown' ? null : answer === 'yes'
}

const FILE_TYPE_MASK = 0o170000
const FILE_TYPE_CHARS: Record<number, string> = {
  0o040000: 'd',
  0o120000: 'l',
  0o100000: '-',
  0o020000: 'c',
  0o060000: 'b',
  0o010000: 'p',
  0o140000: 's'
}

function triad(mode: number, shift: number, special: number, setChar: string): string {
  const read = (mode >> shift) & READ ? 'r' : '-'
  const write = (mode >> shift) & WRITE ? 'w' : '-'
  const exec = ((mode >> shift) & SEARCH) !== 0
  const execChar =
    (mode & special) !== 0 ? (exec ? setChar : setChar.toUpperCase()) : exec ? 'x' : '-'
  return `${read}${write}${execChar}`
}

/** `ls -l` style mode, e.g. `drwxr-sr-x` or `drwxrwxrwt`. */
export function formatRemoteMode(mode: number): string {
  const type = FILE_TYPE_CHARS[mode & FILE_TYPE_MASK] ?? '?'
  return (
    type + triad(mode, 6, 0o4000, 's') + triad(mode, 3, 0o2000, 's') + triad(mode, 0, STICKY, 't')
  )
}
