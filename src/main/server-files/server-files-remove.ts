import { hasPermission } from '../../shared/server-files-access'
import {
  findProtectedDescendant,
  findProtectedRoot,
  remoteParentPath
} from '../../shared/server-files-paths'
import type { RemoteIdentity, RemoveBlockReason, RemovePlan } from '../../shared/server-files-types'
import { diagnoseWriteError, ServerFilesFailure } from './server-files-errors'
import { throwIfCancelled, type ProgressReporter } from './server-files-jobs'
import {
  canonicalRemotePath,
  outermostPaths,
  walkRemoteTree,
  type WalkedEntry
} from './server-files-remote-walk'
import { sftpRmdir, sftpStat, sftpUnlink, type ServerSftp } from './server-files-sftp'

const WRITE = 2
const SEARCH = 1
const STICKY = 0o1000

export type RemovalStep = { path: string; folder: boolean }

export type RemovalDraft = {
  plan: Omit<RemovePlan, 'planId'>
  /** Children before their folder, so every rmdir meets an empty folder. */
  steps: RemovalStep[]
}

type Owner = { mode: number; uid: number; gid: number }

/** Whether `identity` may unlink entries inside `folder` (write+search, and the sticky rule). */
function folderBlocks(
  identity: RemoteIdentity | null,
  folder: Owner,
  child: Owner
): RemoveBlockReason | null {
  if (!identity || identity.uid === 0) {
    return null
  }
  if (
    hasPermission(identity, folder, WRITE) === 'no' ||
    hasPermission(identity, folder, SEARCH) === 'no'
  ) {
    return 'parent-not-writable'
  }
  if ((folder.mode & STICKY) !== 0 && folder.uid !== identity.uid && child.uid !== identity.uid) {
    return 'sticky-not-owner'
  }
  return null
}

function treeBlock(
  identity: RemoteIdentity | null,
  entries: readonly WalkedEntry[]
): { path: string; reason: RemoveBlockReason } | null {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]))
  for (const entry of entries.slice(1)) {
    const folder = byPath.get(remoteParentPath(entry.path))
    const reason = folder ? folderBlocks(identity, folder, entry) : null
    if (reason) {
      return {
        path: folder?.path ?? entry.path,
        reason: reason === 'parent-not-writable' ? 'subfolder-not-writable' : reason
      }
    }
  }
  return null
}

export type RemovalContext = {
  sftp: ServerSftp
  identity: RemoteIdentity | null
  protectedRoots: readonly string[]
}

/** Everything is checked before anything is removed, so a refusal never leaves half a tree. */
export async function draftRemoval(
  context: RemovalContext,
  paths: readonly string[]
): Promise<RemovalDraft> {
  const { sftp, identity, protectedRoots } = context
  const items: RemovePlan['items'] = []
  const blocked: RemovePlan['blocked'] = []
  const steps: RemovalStep[] = []
  for (const path of outermostPaths(paths)) {
    const canonical = await canonicalRemotePath(sftp, path)
    if (findProtectedRoot(path, protectedRoots) || findProtectedRoot(canonical, protectedRoots)) {
      blocked.push({ path, reason: 'protected' })
      continue
    }
    if (
      findProtectedDescendant(path, protectedRoots) ||
      findProtectedDescendant(canonical, protectedRoots)
    ) {
      blocked.push({ path, reason: 'protected-descendant' })
      continue
    }
    const tree = await walkRemoteTree(sftp, path)
    const parent = await sftpStat(sftp, remoteParentPath(path)).catch(() => null)
    const parentReason = parent ? folderBlocks(identity, parent, tree[0]) : null
    const inner = parentReason ? null : treeBlock(identity, tree)
    if (parentReason) {
      blocked.push({ path, reason: parentReason })
      continue
    }
    if (inner) {
      blocked.push(inner)
      continue
    }
    const folders = tree.filter((entry) => entry.kind === 'directory')
    items.push({
      path,
      kind: tree[0].kind,
      fileCount: tree.length - folders.length,
      folderCount: Math.max(0, folders.length - (tree[0].kind === 'directory' ? 1 : 0))
    })
    for (const entry of tree.toReversed()) {
      steps.push({ path: entry.path, folder: entry.kind === 'directory' })
    }
  }
  return { plan: { serverId: '', items, blocked }, steps }
}

export async function runRemoval(
  sftp: ServerSftp,
  steps: readonly RemovalStep[],
  signal: AbortSignal,
  progress: ProgressReporter
): Promise<void> {
  for (const step of steps) {
    throwIfCancelled(signal)
    progress.startFile(step.path)
    try {
      await (step.folder ? sftpRmdir(sftp, step.path) : sftpUnlink(sftp, step.path))
    } catch (error) {
      throw new ServerFilesFailure(
        await diagnoseWriteError(sftp, remoteParentPath(step.path), error, step.path)
      )
    }
    progress.finishFile()
  }
}
