import { createContext, useContext } from 'react'
import type { CopyPlan, TransferPlan } from '../../../../shared/server-files-types'
import type { CopyAnswer } from './CopyPlanDialog'
import type { PathListRequest } from './PathListDialog'
import type { NameRequest } from './RemoteNameDialog'
import type { ConflictAnswer } from './TransferConflictDialog'

export type ServerFilesPrompts = {
  confirmPaths: (request: PathListRequest) => Promise<boolean>
  resolveConflicts: (plan: TransferPlan) => Promise<ConflictAnswer | null>
  askName: (request: NameRequest) => Promise<string | null>
  confirmCopy: (plan: CopyPlan) => Promise<CopyAnswer | null>
}

// Kept component-free so Fast Refresh preserves the context's identity.
export const ServerFilesPromptsContext = createContext<ServerFilesPrompts | null>(null)

export function useServerFilesPrompts(): ServerFilesPrompts {
  const prompts = useContext(ServerFilesPromptsContext)
  if (!prompts) {
    throw new Error('useServerFilesPrompts must be used inside ServerFilesPromptsProvider')
  }
  return prompts
}
