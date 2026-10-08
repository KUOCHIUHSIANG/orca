import { SquareTerminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { ensureCenterGroupId } from '@/store/slices/tabs/tab-group-dock'

/** Shown when every remaining group is docked in the bottom panel. */
export function TabGroupEmptyCenter({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const openTerminal = (): void => {
    const groupId = ensureCenterGroupId(useAppStore.getState, worktreeId)
    useAppStore.getState().createTab(worktreeId, groupId)
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
      <span>No open tabs</span>
      <Button type="button" variant="ghost" size="sm" onClick={openTerminal}>
        <SquareTerminal />
        New terminal
      </Button>
    </div>
  )
}
