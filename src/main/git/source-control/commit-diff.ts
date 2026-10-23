import type { GitDiffResult } from '../../../shared/git-diff-compare-types'
import { stableInFlightKey } from '../../../shared/in-flight-promise-dedupe'
import type { GitRuntimeOptions } from '../git-runtime-options'
import { gitRuntimeOptionsKey } from './git-runtime-options-cache-key'
import { gitDiffReadDedupe } from './git-read-cache-invalidation'
import { buildDiffResult } from './diff-result'
import { blobConversion, readGitBlobAtOidPath, type GitBlobReadResult } from './git-blob-read'
import {
  findContainingSubmodule,
  listSubmodulePaths,
  resolveSubmoduleWorktreePath
} from './submodule-paths'

export async function getCommitDiff(
  worktreePath: string,
  args: {
    commitOid: string
    parentOid?: string | null
    filePath: string
    oldPath?: string
  },
  options: GitRuntimeOptions = {}
): Promise<GitDiffResult> {
  return gitDiffReadDedupe.run(
    stableInFlightKey([
      'commitDiff',
      worktreePath,
      args.commitOid,
      args.parentOid ?? null,
      args.filePath,
      args.oldPath ?? null,
      ...gitRuntimeOptionsKey(options)
    ]),
    () => loadCommitDiff(worktreePath, args, options)
  )
}

async function loadCommitDiff(
  worktreePath: string,
  args: {
    commitOid: string
    parentOid?: string | null
    filePath: string
    oldPath?: string
  },
  options: GitRuntimeOptions
): Promise<GitDiffResult> {
  const submoduleRoute = await routeIntoSubmodule(worktreePath, args, options)
  if (submoduleRoute) {
    return loadCommitDiff(submoduleRoute.worktreePath, submoduleRoute.args, options)
  }
  try {
    const leftPath = args.oldPath ?? args.filePath
    const conversion = blobConversion(worktreePath, args.filePath, options)
    const leftConversion =
      leftPath === args.filePath ? conversion : blobConversion(worktreePath, leftPath, options)
    // Read independent blobs concurrently; root commits have no parent blob.
    const [leftBlob, rightBlob] = await Promise.all([
      args.parentOid
        ? readGitBlobAtOidPath(worktreePath, args.parentOid, leftPath, options, leftConversion)
        : Promise.resolve<GitBlobReadResult>({ content: '', isBinary: false, exists: false }),
      readGitBlobAtOidPath(worktreePath, args.commitOid, args.filePath, options, conversion)
    ])

    return buildDiffResult(
      leftBlob.content,
      rightBlob.content,
      leftBlob.isBinary,
      rightBlob.isBinary,
      args.filePath,
      leftBlob.tooLarge === true || rightBlob.tooLarge === true
    )
  } catch {
    return {
      kind: 'text',
      originalContent: '',
      modifiedContent: '',
      originalIsBinary: false,
      modifiedIsBinary: false
    }
  }
}

/**
 * A file inside a submodule lives in that submodule's repo; the parent's trees only hold its
 * gitlink, so a parent read would come back empty. Nested submodules recurse one level at a time.
 */
async function routeIntoSubmodule(
  worktreePath: string,
  args: { commitOid: string; parentOid?: string | null; filePath: string; oldPath?: string },
  options: GitRuntimeOptions
): Promise<{ worktreePath: string; args: typeof args } | null> {
  const filePath = args.filePath.replace(/\\/g, '/')
  const submodule = findContainingSubmodule(
    await listSubmodulePaths(worktreePath, options),
    filePath
  )
  if (!submodule || filePath === submodule) {
    return null
  }
  const oldPath = args.oldPath?.replace(/\\/g, '/')
  return {
    // Why: validate the .gitmodules-derived path so a crafted one can't escape the worktree.
    worktreePath: resolveSubmoduleWorktreePath(worktreePath, submodule),
    args: {
      ...args,
      filePath: filePath.slice(submodule.length + 1),
      oldPath: oldPath?.startsWith(`${submodule}/`)
        ? oldPath.slice(submodule.length + 1)
        : undefined
    }
  }
}
