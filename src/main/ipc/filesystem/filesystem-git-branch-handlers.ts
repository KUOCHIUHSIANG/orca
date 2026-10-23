import { ipcMain } from 'electron'
import { checkoutBranch, createBranch, listLocalBranches } from '../../git/checkout'
import { resolveRegisteredWorktreePath } from '../registered-worktree-roots-cache'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'
import type { RuntimeGitLocalBranches } from '../../../shared/runtime-worktree-contracts'

type BranchArgs = { worktreePath: string; branch: string; connectionId?: string }

export function registerFilesystemGitBranchHandlers(context: FilesystemHandlerContext): void {
  const { store } = context
  const resolveTarget = async (args: { worktreePath: string; connectionId?: string }) => {
    requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
    const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
    const gitOptions = getLocalGitOptionsForRegisteredWorktree(
      store,
      args.worktreePath,
      worktreePath
    )
    return { worktreePath, gitOptions }
  }

  ipcMain.handle(
    'git:localBranches',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string }
    ): Promise<RuntimeGitLocalBranches> => {
      const { worktreePath, gitOptions } = await resolveTarget(args)
      return listLocalBranches(worktreePath, gitOptions)
    }
  )

  ipcMain.handle('git:checkout', async (_event, args: BranchArgs): Promise<void> => {
    const { worktreePath, gitOptions } = await resolveTarget(args)
    await checkoutBranch(worktreePath, args.branch, { ...gitOptions, admissionTier: 'interactive' })
  })

  ipcMain.handle('git:createBranch', async (_event, args: BranchArgs): Promise<void> => {
    const { worktreePath, gitOptions } = await resolveTarget(args)
    await createBranch(worktreePath, args.branch, { ...gitOptions, admissionTier: 'interactive' })
  })
}
