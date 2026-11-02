import { useMemo } from 'react'
import type { CopyPlan, TransferPlan } from '../../../../shared/server-files-types'
import { CopyPlanDialog, type CopyAnswer } from './CopyPlanDialog'
import { PathListDialog, type PathListRequest } from './PathListDialog'
import { RemoteNameDialog, type NameRequest } from './RemoteNameDialog'
import { ServerFilesPromptsContext, type ServerFilesPrompts } from './server-files-prompts-context'
import { TransferConflictDialog, type ConflictAnswer } from './TransferConflictDialog'
import { usePromptChannel } from './use-prompt-channel'

export function ServerFilesPromptsProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const paths = usePromptChannel<PathListRequest, boolean>()
  const conflicts = usePromptChannel<TransferPlan, ConflictAnswer | null>()
  const names = usePromptChannel<NameRequest, string | null>()
  const copies = usePromptChannel<CopyPlan, CopyAnswer | null>()
  const value = useMemo<ServerFilesPrompts>(
    () => ({
      confirmPaths: paths.ask,
      resolveConflicts: conflicts.ask,
      askName: names.ask,
      confirmCopy: copies.ask
    }),
    [paths.ask, conflicts.ask, names.ask, copies.ask]
  )
  return (
    <ServerFilesPromptsContext.Provider value={value}>
      {children}
      <PathListDialog request={paths.current} onSettle={paths.settle} />
      <TransferConflictDialog plan={conflicts.current} onSettle={conflicts.settle} />
      <RemoteNameDialog request={names.current} onSettle={names.settle} />
      <CopyPlanDialog plan={copies.current} onSettle={copies.settle} />
    </ServerFilesPromptsContext.Provider>
  )
}
