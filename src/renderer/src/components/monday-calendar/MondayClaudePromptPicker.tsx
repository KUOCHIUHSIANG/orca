import { useMemo, useState } from 'react'
import { Copy, Folder, GitBranch } from 'lucide-react'
import { toast } from 'sonner'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getFolderWorkspaceWorktree } from '@/store/workspace-record-selectors'
import type { Worktree } from '../../../../shared/worktree/types'
import { copyMondayPrompt, openMondayPromptInClaude } from './monday-claude-launch'

const LAST_WORKSPACE_KEY = 'orca.mondayCalendar.claudePromptWorkspaceId'
const COPY_ONLY_VALUE = 'monday-claude-copy-only'

type WorkspaceGroup = {
  id: string
  /** null labels the folder workspaces group. */
  repoName: string | null
  workspaces: Worktree[]
}

function useOpenWorkspaceGroups(): WorkspaceGroup[] {
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const folderWorkspaces = useAppStore((state) => state.folderWorkspaces)
  return useMemo(() => {
    const groups: WorkspaceGroup[] = repos.map((repo) => ({
      id: repo.id,
      repoName: repo.displayName,
      workspaces: (worktreesByRepo[repo.id] ?? []).filter((worktree) => !worktree.isArchived)
    }))
    groups.push({
      id: 'folders',
      repoName: null,
      workspaces: folderWorkspaces
        .filter((folder) => !folder.isArchived)
        .map((folder) => getFolderWorkspaceWorktree(folder))
    })
    return groups.filter((group) => group.workspaces.length > 0)
  }, [folderWorkspaces, repos, worktreesByRepo])
}

/** Picks an open project, then opens Claude there with the monday prompt typed in. */
export function MondayClaudePromptPicker(props: {
  buildPrompt: () => string
  /** Shown on hover for icon-only triggers. */
  tooltip?: string
  children: React.ReactElement
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [lastWorkspaceId, setLastWorkspaceId] = useState<string | null>(null)
  const groups = useOpenWorkspaceGroups()
  const foldersLabel = translate('auto.components.mondayCalendar.claude.folders', 'Folders')

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) {
      setLastWorkspaceId(localStorage.getItem(LAST_WORKSPACE_KEY))
    }
    setOpen(nextOpen)
  }

  const launchIn = (workspaceId: string): void => {
    setOpen(false)
    localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId)
    void openMondayPromptInClaude(workspaceId, props.buildPrompt())
  }

  const copyOnly = async (): Promise<void> => {
    setOpen(false)
    if (await copyMondayPrompt(props.buildPrompt())) {
      toast.success(translate('auto.components.mondayCalendar.claude.copied', 'Prompt copied.'))
    }
  }

  const trigger = <PopoverTrigger asChild>{props.children}</PopoverTrigger>
  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {props.tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {props.tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <PopoverContent align="end" className="w-72">
        <Command defaultValue={lastWorkspaceId ?? undefined}>
          <CommandInput
            placeholder={translate(
              'auto.components.mondayCalendar.claude.search',
              'Open Claude in project…'
            )}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>
              {translate('auto.components.mondayCalendar.claude.noProjects', 'No projects found.')}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.id} heading={group.repoName ?? foldersLabel}>
                {group.workspaces.map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    value={workspace.id}
                    keywords={[workspace.displayName, group.repoName ?? foldersLabel]}
                    onSelect={() => launchIn(workspace.id)}
                  >
                    {group.repoName ? <GitBranch /> : <Folder />}
                    <span className="truncate">{workspace.displayName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandSeparator alwaysRender />
            <CommandGroup forceMount>
              <CommandItem forceMount value={COPY_ONLY_VALUE} onSelect={() => void copyOnly()}>
                <Copy />
                {translate(
                  'auto.components.mondayCalendar.claude.copyOnly',
                  'Copy prompt to clipboard only'
                )}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
