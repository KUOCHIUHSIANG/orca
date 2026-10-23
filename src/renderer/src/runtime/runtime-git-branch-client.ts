import type { RuntimeGitLocalBranches } from '../../../shared/runtime-worktree-contracts'
import { resolveLocalWorktreePath, type RuntimeGitContext } from './runtime-git-client-context'
import { callRuntimeRpc } from './runtime-rpc-client'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'

const BRANCH_SWITCH_TIMEOUT_MS = 60_000

export async function listRuntimeGitLocalBranches(
  context: RuntimeGitContext
): Promise<RuntimeGitLocalBranches> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.git.localBranches({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId
    })
  }
  return callRuntimeRpc<RuntimeGitLocalBranches>(
    target,
    'git.localBranches',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId) },
    { timeoutMs: 15_000 }
  )
}

/** Switches to a local branch; a remote branch's short name makes git create the tracking branch. */
export async function checkoutRuntimeGitBranch(
  context: RuntimeGitContext,
  branch: string
): Promise<void> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.checkout({
      worktreePath: resolveLocalWorktreePath(context),
      branch,
      connectionId: context.connectionId
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.checkout',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), branch },
    { timeoutMs: BRANCH_SWITCH_TIMEOUT_MS }
  )
}

export async function createRuntimeGitBranch(
  context: RuntimeGitContext,
  branch: string
): Promise<void> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.createBranch({
      worktreePath: resolveLocalWorktreePath(context),
      branch,
      connectionId: context.connectionId
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.createBranch',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), branch },
    { timeoutMs: BRANCH_SWITCH_TIMEOUT_MS }
  )
}
