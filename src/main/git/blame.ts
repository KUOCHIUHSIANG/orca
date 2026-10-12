import type { GitBlameOptions, GitBlameResult } from '../../shared/git-blame'
import { loadGitBlameFromExecutor } from '../../shared/git-blame'
import type { GitRuntimeOptions } from './command-runner/git-runtime-options'
import { gitReadOptionsForWorktree } from './command-runner/git-runtime-options'
import { gitExecFileAsync } from './command-runner/git-exec-file'

export async function getBlame(
  worktreePath: string,
  relativePath: string,
  options: GitBlameOptions & GitRuntimeOptions = {}
): Promise<GitBlameResult> {
  return loadGitBlameFromExecutor(
    (args, cwd, stdin) =>
      gitExecFileAsync(args, {
        ...gitReadOptionsForWorktree(cwd, options),
        ...(stdin === undefined ? {} : { stdin })
      }),
    worktreePath,
    relativePath,
    { contents: options.contents }
  )
}
