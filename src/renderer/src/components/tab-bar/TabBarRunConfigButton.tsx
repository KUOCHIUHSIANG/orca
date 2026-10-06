import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Play, Square, TerminalSquare } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { RunConfiguration } from '../../../../shared/run-configuration-types'
import { detectRunConfigurations } from '@/lib/run-configuration-detection'
import { runConfigurationInNewTab } from '@/lib/run-configuration-in-new-tab'

type TabBarRunConfigButtonProps = {
  worktreeId: string
  groupId: string
}

function DotnetIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}

function SectionHeader({
  icon,
  label
}: {
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
    </div>
  )
}

const POLL_INTERVAL_MS = 2000

export function TabBarRunConfigButton({
  worktreeId,
  groupId
}: TabBarRunConfigButtonProps): React.JSX.Element | null {
  const repos = useAppStore((s) => s.repos)
  const ptyIdsByTabId = useAppStore((s) => s.ptyIdsByTabId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [configs, setConfigs] = useState<RunConfiguration[]>([])
  const [loading, setLoading] = useState(false)
  const [recentConfigId, setRecentConfigId] = useState<string | null>(null)
  const [configTabMap, setConfigTabMap] = useState<Map<string, string>>(new Map())
  const [runningSet, setRunningSet] = useState<Set<string>>(new Set())

  const ptyIdsByTabIdRef = useRef(ptyIdsByTabId)
  ptyIdsByTabIdRef.current = ptyIdsByTabId

  const repoId = useMemo(() => {
    if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      return null
    }
    const candidate = getRepoIdFromWorktreeId(worktreeId)
    return repos.some((r) => r.id === candidate) ? candidate : null
  }, [worktreeId, repos])

  const repoPath = useMemo(() => {
    if (!repoId) {
      return null
    }
    return repos.find((r) => r.id === repoId)?.path ?? null
  }, [repoId, repos])

  const runDetection = useCallback(async () => {
    if (!repoPath) {
      return
    }
    setLoading(true)
    try {
      const detected = await detectRunConfigurations(repoPath)
      setConfigs(detected)
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => {
    void runDetection()
  }, [runDetection])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setMenuOpen(next)
      if (next) {
        void runDetection()
      }
    },
    [runDetection]
  )

  useEffect(() => {
    if (configTabMap.size === 0) {
      setRunningSet(new Set())
      return
    }

    const check = async (): Promise<void> => {
      const running = new Set<string>()
      for (const [configId, tabId] of configTabMap) {
        const ptyIds = ptyIdsByTabIdRef.current[tabId] ?? []
        if (ptyIds.length === 0) {
          continue
        }
        try {
          const has = await window.api.pty.hasChildProcesses(ptyIds[0])
          if (has) {
            running.add(configId)
          }
        } catch {
          // pty gone
        }
      }
      setRunningSet(running)
    }

    const id = setInterval(() => void check(), POLL_INTERVAL_MS)
    void check()
    return () => clearInterval(id)
  }, [configTabMap])

  const dotnetConfigs = useMemo(() => configs.filter((c) => c.type === 'dotnet'), [configs])
  const npmConfigs = useMemo(() => configs.filter((c) => c.type === 'npm'), [configs])

  const mostRecent = useMemo(() => {
    if (recentConfigId) {
      return configs.find((c) => c.id === recentConfigId) ?? configs[0] ?? null
    }
    return configs[0] ?? null
  }, [configs, recentConfigId])

  const isMostRecentRunning = mostRecent ? runningSet.has(mostRecent.id) : false

  const stopConfig = useCallback(
    (configId: string) => {
      const tabId = configTabMap.get(configId)
      if (!tabId) {
        return
      }
      const ptyIds = ptyIdsByTabIdRef.current[tabId] ?? []
      for (const ptyId of ptyIds) {
        window.api.pty.write(ptyId, '\x03', 'driving')
      }
    },
    [configTabMap]
  )

  const handleConfigAction = useCallback(
    (config: RunConfiguration) => {
      setMenuOpen(false)
      if (runningSet.has(config.id)) {
        stopConfig(config.id)
        return
      }
      setRecentConfigId(config.id)
      const result = runConfigurationInNewTab({ config, worktreeId, groupId })
      if (result) {
        setConfigTabMap((prev) => new Map(prev).set(config.id, result.tabId))
      }
    },
    [worktreeId, groupId, runningSet, stopConfig]
  )

  const handlePrimaryClick = useCallback(() => {
    if (!mostRecent) {
      return
    }
    if (isMostRecentRunning) {
      stopConfig(mostRecent.id)
    } else {
      handleConfigAction(mostRecent)
    }
  }, [mostRecent, isMostRecentRunning, stopConfig, handleConfigAction])

  if (!repoId) {
    return null
  }

  const hasConfigs = configs.length > 0

  const splitButtonClass =
    'my-auto flex h-7 shrink-0 items-stretch overflow-hidden rounded-md border border-border/60 text-muted-foreground'
  const innerButtonBase =
    'flex items-center bg-transparent leading-none text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  if (!hasConfigs && !loading) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => handleOpenChange(true)}
            className="my-auto flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Run configuration"
          >
            <Play className="size-3.5" />
            <span className="text-[12px] font-medium @max-[480px]/tab-strip:hidden">Run</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          No run configurations detected
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className={splitButtonClass}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handlePrimaryClick}
            disabled={!mostRecent}
            className={cn(innerButtonBase, 'gap-1.5 rounded-l-md rounded-r-none px-1.5')}
            aria-label={
              isMostRecentRunning
                ? `Stop: ${mostRecent?.label}`
                : mostRecent
                  ? `Run: ${mostRecent.label}`
                  : 'Run configuration'
            }
          >
            {isMostRecentRunning ? (
              <Square className="size-3 shrink-0" fill="currentColor" strokeWidth={0} />
            ) : (
              <Play className="size-3 shrink-0" fill="currentColor" strokeWidth={0} />
            )}
            {/* Why: every split strip mounts this now, so narrow strips go icon-only by width. */}
            <span className="max-w-[160px] truncate text-[12px] font-medium @max-[480px]/tab-strip:hidden">
              {mostRecent?.label ?? 'Run'}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {isMostRecentRunning
            ? `Stop: ${mostRecent?.command}`
            : mostRecent
              ? `Run: ${mostRecent.command}`
              : 'Run configuration'}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu modal={false} open={menuOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              innerButtonBase,
              'justify-center rounded-l-none rounded-r-md border-l border-border/60 px-1'
            )}
            aria-label="More run configurations"
          >
            <ChevronDown className="size-3" strokeWidth={2.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-80">
          <div className="max-h-80 overflow-y-auto scrollbar-sleek">
            {loading && configs.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                Detecting configurations...
              </div>
            ) : null}
            {dotnetConfigs.length > 0 ? (
              <>
                <SectionHeader icon={<DotnetIcon className="size-3" />} label=".NET Projects" />
                {dotnetConfigs.map((config) => {
                  const running = runningSet.has(config.id)
                  return (
                    <DropdownMenuItem key={config.id} onSelect={() => handleConfigAction(config)}>
                      {running ? (
                        <Square
                          className="size-3 shrink-0 text-muted-foreground"
                          fill="currentColor"
                          strokeWidth={0}
                        />
                      ) : (
                        <DotnetIcon className="size-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{config.label}</span>
                      {running ? (
                        <span className="text-[10px] text-muted-foreground">Running</span>
                      ) : null}
                    </DropdownMenuItem>
                  )
                })}
              </>
            ) : null}
            {dotnetConfigs.length > 0 && npmConfigs.length > 0 ? <DropdownMenuSeparator /> : null}
            {npmConfigs.length > 0 ? (
              <>
                <SectionHeader icon={<TerminalSquare className="size-3" />} label="npm Scripts" />
                {npmConfigs.map((config) => {
                  const running = runningSet.has(config.id)
                  return (
                    <DropdownMenuItem key={config.id} onSelect={() => handleConfigAction(config)}>
                      {running ? (
                        <Square
                          className="size-3 shrink-0 text-muted-foreground"
                          fill="currentColor"
                          strokeWidth={0}
                        />
                      ) : (
                        <TerminalSquare className="size-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{config.label}</span>
                      {running ? (
                        <span className="text-[10px] text-muted-foreground">Running</span>
                      ) : null}
                    </DropdownMenuItem>
                  )
                })}
              </>
            ) : null}
            {!loading && configs.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                No configurations detected
              </div>
            ) : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
