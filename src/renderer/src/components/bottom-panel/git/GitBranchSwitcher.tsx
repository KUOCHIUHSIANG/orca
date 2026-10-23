import {
  Check,
  ChevronDown,
  CloudDownload,
  GitBranch,
  Loader2,
  Plus,
  SquareArrowOutUpRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { GitToolWindowModel } from './use-git-tool-window'
import { useGitBranchSwitcher, type GitBranchSwitcherModel } from './use-git-branch-switcher'

function NewBranchForm({
  switcher,
  fromLabel
}: {
  switcher: GitBranchSwitcherModel
  fromLabel: string
}): React.JSX.Element {
  const { newBranchName, setNewBranchName, createBranch, setCreating, pending } = switcher
  return (
    <form
      className="flex flex-col gap-2 p-2"
      onSubmit={(event) => {
        event.preventDefault()
        createBranch()
      }}
    >
      <div className="text-xs font-medium text-foreground">New branch</div>
      <Input
        autoFocus
        value={newBranchName}
        onChange={(event) => setNewBranchName(event.target.value)}
        placeholder="branch-name"
        spellCheck={false}
        className="h-7"
      />
      <div className="text-2xs text-muted-foreground">
        From {fromLabel}. Uncommitted changes come along.
      </div>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="xs" onClick={() => setCreating(false)}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={!newBranchName.trim() || pending !== null}>
          {pending !== null && <Loader2 className="size-3.5 animate-spin" />}
          Create
        </Button>
      </div>
    </form>
  )
}

function BranchList({ switcher }: { switcher: GitBranchSwitcherModel }): React.JSX.Element {
  const { query, setQuery, trimmedQuery, loading, localRows, remoteRows, pending } = switcher
  const busy = pending !== null
  return (
    <Command shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search branches…" />
      <CommandList className="max-h-80">
        <CommandGroup>
          <CommandItem value="__new_branch__" disabled={busy} onSelect={switcher.startCreate}>
            <Plus className="size-4" />
            <span className="min-w-0 truncate">
              {trimmedQuery ? `New branch “${trimmedQuery}”…` : 'New branch…'}
            </span>
          </CommandItem>
        </CommandGroup>
        {localRows.length > 0 && (
          <CommandGroup heading="Local">
            {localRows.map((row) => (
              <CommandItem
                key={row.name}
                value={`local:${row.name}`}
                disabled={busy}
                onSelect={() => {
                  if (row.current) {
                    switcher.setOpen(false)
                  } else if (row.openIn) {
                    switcher.openWorktree(row.openIn.worktreeId)
                  } else {
                    switcher.checkout(row.name)
                  }
                }}
              >
                {pending === row.name ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className={cn('size-4', row.current ? 'opacity-100' : 'opacity-0')} />
                )}
                <span className="min-w-0 truncate">{row.name}</span>
                {row.openIn && (
                  <span
                    className="ml-auto flex min-w-0 shrink items-center gap-1 text-2xs text-muted-foreground"
                    title={`Checked out in ${row.openIn.label}. Select to open that workspace.`}
                  >
                    <SquareArrowOutUpRight className="size-3 shrink-0" />
                    <span className="truncate">{row.openIn.label}</span>
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {remoteRows.length > 0 && (
          <CommandGroup heading="Remote">
            {remoteRows.map((row) => (
              <CommandItem
                key={row.ref}
                value={`remote:${row.ref}`}
                disabled={busy}
                onSelect={() => switcher.checkout(row.localName)}
              >
                {pending === row.localName ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4 opacity-0" />
                )}
                <span className="min-w-0 truncate">{row.ref}</span>
                {row.hasLocal && (
                  <span
                    className="ml-auto shrink-0 text-2xs text-muted-foreground"
                    title={`Switches to the existing local branch ${row.localName}.`}
                  >
                    local
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {loading && (
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading branches…</div>
        )}
        {!loading && localRows.length === 0 && remoteRows.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">No branches found.</div>
        )}
      </CommandList>
      <div className="flex items-center gap-2 border-t border-border p-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={() => void switcher.fetchRemotes()}
        >
          <CloudDownload className="size-3.5" />
          Fetch remote branches
        </Button>
        {switcher.pushTargetLabel && (
          <span
            className="ml-auto min-w-0 truncate text-2xs text-muted-foreground"
            title="This workspace was created for a review branch; Push keeps targeting it after a switch."
          >
            Pushes to {switcher.pushTargetLabel}
          </span>
        )}
      </div>
    </Command>
  )
}

/** Toolbar branch label that opens a picker to switch, check out a remote, or create a branch. */
export function GitBranchSwitcher({ model }: { model: GitToolWindowModel }): React.JSX.Element {
  const { branchName } = model.context
  const switcher = useGitBranchSwitcher(model)
  const label = branchName || 'Detached HEAD'
  return (
    <Popover open={switcher.open} onOpenChange={switcher.setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="min-w-0 max-w-72"
          aria-label={`Current branch: ${label}. Switch branch`}
        >
          {switcher.pending !== null ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
          ) : (
            <GitBranch className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80">
        {switcher.creating ? (
          <NewBranchForm switcher={switcher} fromLabel={branchName || 'HEAD'} />
        ) : (
          <BranchList switcher={switcher} />
        )}
      </PopoverContent>
    </Popover>
  )
}
