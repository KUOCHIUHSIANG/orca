import type { GitBlameSubmoduleCommit } from '../../shared/git-blame'
import type { GitRuntimeOptions } from './command-runner/git-runtime-options'
import { gitReadOptionsForWorktree } from './command-runner/git-runtime-options'
import { gitExecFileAsync } from './command-runner/git-exec-file'
import { getRemoteCommitUrl } from './remotes/repo-remote-queries'
import { resolveSubmoduleWorktreePath } from './source-control/submodules/submodule-paths'

/**
 * A submodule commit's full message and web URL.
 * Why its own read: history and remote-URL reads run in the worktree's repo, which only holds the
 * submodule's gitlink, never its commits.
 */
export async function getBlameSubmoduleCommit(
  worktreePath: string,
  submodulePath: string,
  sha: string,
  options: GitRuntimeOptions = {}
): Promise<GitBlameSubmoduleCommit> {
  const repoPath = resolveSubmoduleWorktreePath(worktreePath, submodulePath)
  const [message, remoteUrl] = await Promise.all([
    gitExecFileAsync(
      ['log', '-1', '--format=%B', sha, '--'],
      gitReadOptionsForWorktree(repoPath, options)
    ).then(
      ({ stdout }) => stdout.trim() || null,
      () => null
    ),
    getRemoteCommitUrl(repoPath, sha).catch(() => null)
  ])
  return { message, remoteUrl }
}
