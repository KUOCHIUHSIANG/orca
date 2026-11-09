import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { DetachedWorkspaceGroup } from '../../../../shared/detached-pages'
import { isDetachedPageWindow } from '../detached-pages/detached-page-location'
import { copyMondayPrompt, openMondayPromptInClaude } from './monday-claude-launch'
import { openWorkspaceGroups } from './monday-claude-workspace-groups'
import type { MondayClaudeAction } from './monday-claude-prompt'

const LAST_WORKSPACE_KEY = 'orca.mondayCalendar.claudePromptWorkspaceId'
const ACTION_KEY = 'orca.mondayCalendar.claudePromptAction'
const COPY_ONLY_VALUE = 'monday-claude-copy-only'
const ACTIONS: readonly MondayClaudeAction[] = ['implement', 'reply']

function readSavedAction(): MondayClaudeAction {
  return localStorage.getItem(ACTION_KEY) === 'implement' ? 'implement' : 'reply'
}

function actionLabel(action: MondayClaudeAction): string {
  return action === 'implement'
    ? translate('auto.components.mondayCalendar.claude.implement', 'Implement / fix')
    : translate('auto.components.mondayCalendar.claude.reply', 'Understand & reply')
}

function useOpenWorkspaceGroups(pickerOpen: boolean): DetachedWorkspaceGroup[] {
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const folderWorkspaces = useAppStore((state) => state.folderWorkspaces)
  const local = useMemo(
    () => openWorkspaceGroups({ repos, worktreesByRepo, folderWorkspaces }),
    [folderWorkspaces, repos, worktreesByRepo]
  )
  const detached = isDetachedPageWindow()
  const [fromMainWindow, setFromMainWindow] = useState<DetachedWorkspaceGroup[]>([])
  useEffect(() => {
    if (!detached || !pickerOpen) {
      return
    }
    let cancelled = false
    // This window's store holds no projects; ask the main window each time the picker opens.
    void window.api.detachedPages
      .callMainWindow({ action: 'workspaceGroups' })
      .then((groups) => {
        if (!cancelled) {
          setFromMainWindow(groups)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [detached, pickerOpen])
  return detached ? fromMainWindow : local
}

/** Picks what Claude should do and an open project, then opens Claude there with the prompt typed in. */
export function MondayClaudePromptPicker(props: {
  buildPrompt: (action: MondayClaudeAction) => string
  /** Shown on hover for icon-only triggers. */
  tooltip?: string
  children: React.ReactElement
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [lastWorkspaceId, setLastWorkspaceId] = useState<string | null>(null)
  const [action, setAction] = useState<MondayClaudeAction>(readSavedAction)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const groups = useOpenWorkspaceGroups(open)
  const foldersLabel = translate('auto.components.mondayCalendar.claude.folders', 'Folders')

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) {
      setLastWorkspaceId(localStorage.getItem(LAST_WORKSPACE_KEY))
      // Why: every comment has its own picker, so pick up a choice made in another one.
      setAction(readSavedAction())
    }
    setOpen(nextOpen)
  }

  const launchIn = (workspaceId: string): void => {
    setOpen(false)
    localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId)
    void openMondayPromptInClaude(workspaceId, props.buildPrompt(action))
  }

  const copyOnly = async (): Promise<void> => {
    setOpen(false)
    if (await copyMondayPrompt(props.buildPrompt(action))) {
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
      <PopoverContent
        align="end"
        className="w-72"
        onOpenAutoFocus={(event) => {
          // Why: the action toggle comes first, but typing a project name is the common next step.
          event.preventDefault()
          searchInputRef.current?.focus()
        }}
      >
        <div className="border-b border-border p-2">
          <ToggleGroup
            role="radiogroup"
            aria-label={translate(
              'auto.components.mondayCalendar.claude.actionLabel',
              'What Claude should do'
            )}
            type="single"
            spacing={1}
            size="sm"
            variant="segmented-card"
            value={action}
            onValueChange={(next) => {
              const picked = ACTIONS.find((candidate) => candidate === next)
              if (picked) {
                setAction(picked)
                localStorage.setItem(ACTION_KEY, picked)
              }
            }}
          >
            {ACTIONS.map((candidate) => (
              <ToggleGroupItem
                key={candidate}
                role="radio"
                aria-checked={action === candidate}
                value={candidate}
              >
                {actionLabel(candidate)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Command defaultValue={lastWorkspaceId ?? undefined}>
          <CommandInput
            ref={searchInputRef}
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
