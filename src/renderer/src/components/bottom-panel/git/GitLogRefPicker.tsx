import { useEffect, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { searchRuntimeRepoBaseRefs } from '@/runtime/runtime-repo-client'
import { getRepoExecutionHostId } from '../../../../../shared/execution-host'
import { useGitToolWindowState } from './git-tool-window-state'
import type { GitToolWindowModel } from './use-git-tool-window'

const SEARCH_DEBOUNCE_MS = 200
const SEARCH_LIMIT = 30

function refLabel(ref: string): string {
  return ref.replace(/^refs\/heads\//, '')
}

/** Picks which branch the log lists: the current branch with its upstream, or any other ref. */
export function GitLogRefPicker({ model }: { model: GitToolWindowModel }): React.JSX.Element {
  const { context, logRef } = model
  const { activeRepo, activeWorktreeId, branchName, remoteStatus } = context
  const setLogRef = useGitToolWindowState((state) => state.setLogRef)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ query: string; refs: string[] } | null>(null)
  const trimmedQuery = query.trim()
  const repoId = activeRepo?.id ?? null
  const hostId = activeRepo ? getRepoExecutionHostId(activeRepo) : undefined

  useEffect(() => {
    if (!open || !repoId || !hostId || trimmedQuery.length < 2) {
      return
    }
    let stale = false
    const timer = window.setTimeout(() => {
      void searchRuntimeRepoBaseRefs(hostId, repoId, trimmedQuery, SEARCH_LIMIT)
        .then((refs) => {
          if (!stale) {
            setSearch({ query: trimmedQuery, refs })
          }
        })
        .catch(() => {
          if (!stale) {
            setSearch({ query: trimmedQuery, refs: [] })
          }
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [hostId, open, repoId, trimmedQuery])

  const currentLabel = branchName || 'HEAD'
  const searching = trimmedQuery.length >= 2 && search?.query !== trimmedQuery
  const results = trimmedQuery.length >= 2 && search?.query === trimmedQuery ? search.refs : []
  const suggestions = [remoteStatus?.upstreamName].filter(
    (ref): ref is string => Boolean(ref) && ref !== logRef
  )
  const select = (ref: string | null): void => {
    if (activeWorktreeId) {
      setLogRef(activeWorktreeId, ref)
    }
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className="min-w-0 max-w-64">
          <span className="truncate">Log: {logRef ? refLabel(logRef) : currentLabel}</span>
          <ChevronDown className="size-3 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search branches…" />
          <CommandList className="max-h-72">
            <CommandEmpty>{searching ? 'Searching branches…' : 'No branches found.'}</CommandEmpty>
            {trimmedQuery.length < 2 && (
              <CommandGroup>
                <CommandItem value="__current__" onSelect={() => select(null)}>
                  <Check className={cn('size-4', logRef === null ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 truncate">{currentLabel} (with upstream)</span>
                </CommandItem>
                {suggestions.map((ref) => (
                  <CommandItem key={ref} value={ref} onSelect={() => select(ref)}>
                    <Check className="size-4 opacity-0" />
                    <span className="min-w-0 truncate">{ref}</span>
                  </CommandItem>
                ))}
                {logRef && (
                  <CommandItem value={logRef} onSelect={() => select(logRef)}>
                    <Check className="size-4" />
                    <span className="min-w-0 truncate">{refLabel(logRef)}</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((ref) => (
                  <CommandItem key={ref} value={ref} onSelect={() => select(ref)}>
                    <Check className={cn('size-4', logRef === ref ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0 truncate">{refLabel(ref)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
