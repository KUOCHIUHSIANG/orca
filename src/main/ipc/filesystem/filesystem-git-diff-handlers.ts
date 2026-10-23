import { ipcMain } from 'electron'
import type { GitBlameResult, GitBlameSubmoduleCommit } from '../../../shared/git-blame'
import type { GitDiffResult } from '../../../shared/git/diff/git-diff-compare-types'
import { getBlame } from '../../git/blame'
import { getBlameSubmoduleCommit } from '../../git/blame-submodule-commit'
import { getBranchDiff } from '../../git/source-control/branch-diff'
import { getCommitDiff } from '../../git/source-control/commit-diff'
import {
  validateFullGitObjectId,
  validateGitRelativeFilePath
} from './access/filesystem-path-containment'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'
import { readWorktreeGitUnlessWslStopped } from './wsl-gated-worktree-git-read'

export function registerFilesystemGitDiffHandlers(context: FilesystemHandlerContext): void {
  const { store } = context
  ipcMain.handle(
    'git:branchDiff',
    async (
      _event,
      args: {
        worktreePath: string
        compare: {
          baseRef: string
          baseOid: string
          headOid: string
          mergeBase: string
        }
        filePath: string
        oldPath?: string
        connectionId?: string
        /** Showing the diff tab or its Retry: a user act that may start a stopped WSL distro. */
        wakeWslDistro?: boolean
      }
    ): Promise<GitDiffResult> => {
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      return readWorktreeGitUnlessWslStopped(
        store,
        args.worktreePath,
        args.wakeWslDistro,
        (worktreePath, gitOptions) =>
          getBranchDiff(
            worktreePath,
            {
              mergeBase: args.compare.mergeBase,
              headOid: args.compare.headOid,
              filePath: validateGitRelativeFilePath(worktreePath, args.filePath),
              oldPath: args.oldPath
                ? validateGitRelativeFilePath(worktreePath, args.oldPath)
                : undefined
            },
            { ...gitOptions, admissionTier: 'interactive' }
          )
      )
    }
  )

  ipcMain.handle(
    'git:commitDiff',
    async (
      _event,
      args: {
        worktreePath: string
        commitOid: string
        parentOid?: string | null
        filePath: string
        oldPath?: string
        connectionId?: string
        /** Showing the diff tab or its Retry: a user act that may start a stopped WSL distro. */
        wakeWslDistro?: boolean
      }
    ): Promise<GitDiffResult> => {
      const commitOid = validateFullGitObjectId(args.commitOid, 'commitOid')
      const parentOid = args.parentOid ? validateFullGitObjectId(args.parentOid, 'parentOid') : null
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      return readWorktreeGitUnlessWslStopped(
        store,
        args.worktreePath,
        args.wakeWslDistro,
        (worktreePath, gitOptions) =>
          getCommitDiff(
            worktreePath,
            {
              commitOid,
              parentOid,
              filePath: validateGitRelativeFilePath(worktreePath, args.filePath),
              oldPath: args.oldPath
                ? validateGitRelativeFilePath(worktreePath, args.oldPath)
                : undefined
            },
            { ...gitOptions, admissionTier: 'interactive' }
          )
      )
    }
  )

  ipcMain.handle(
    'git:blame',
    async (
      _event,
      args: { worktreePath: string; filePath: string; contents?: string; connectionId?: string }
    ): Promise<GitBlameResult> => {
      const contents = typeof args.contents === 'string' ? args.contents : undefined
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      // Why: blame follows cursor moves, a background read that must not boot a stopped distro.
      return readWorktreeGitUnlessWslStopped(
        store,
        args.worktreePath,
        false,
        (worktreePath, gitOptions) =>
          getBlame(worktreePath, validateGitRelativeFilePath(worktreePath, args.filePath), {
            ...gitOptions,
            contents,
            admissionTier: 'interactive'
          })
      )
    }
  )
  ipcMain.handle(
    'git:blameSubmoduleCommit',
    async (
      _event,
      args: { worktreePath: string; submodulePath: unknown; sha: string; connectionId?: string }
    ): Promise<GitBlameSubmoduleCommit> => {
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      if (typeof args.submodulePath !== 'string') {
        throw new Error('Access denied: invalid submodule path')
      }
      const submodulePath = args.submodulePath
      const sha = validateFullGitObjectId(args.sha, 'sha')
      // Why: the blame hover card is a background read that must not boot a stopped distro.
      return readWorktreeGitUnlessWslStopped(
        store,
        args.worktreePath,
        false,
        (worktreePath, gitOptions) =>
          getBlameSubmoduleCommit(worktreePath, submodulePath, sha, {
            ...gitOptions,
            admissionTier: 'interactive'
          })
      )
    }
  )
}
