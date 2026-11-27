import { create } from 'zustand'
import type { RunConfiguration } from '../../../shared/run-configuration-types'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'

// Why localStorage: a per-device menu preference, kept out of the synced persisted-UI schema.
const STORAGE_KEY = 'orca.runConfigurationLastDotnet'

type RunConfigurationLastRunState = {
  /** Repo id → id of the .NET config launched last there. */
  lastDotnetByRepo: Readonly<Record<string, string>>
  remember: (repoId: string, configId: string) => void
}

function readPersisted(): Record<string, string> {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage?.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

export const useRunConfigurationLastRun = create<RunConfigurationLastRunState>((set) => ({
  lastDotnetByRepo: readPersisted(),
  remember: (repoId, configId) =>
    set((state) =>
      state.lastDotnetByRepo[repoId] === configId
        ? state
        : { lastDotnetByRepo: { ...state.lastDotnetByRepo, [repoId]: configId } }
    )
}))

/** Records a .NET launch (e.g. its https profile) for the Run button's default; npm runs are not tracked. */
export function rememberRunConfigurationLaunch(worktreeId: string, config: RunConfiguration): void {
  if (config.type === 'dotnet') {
    useRunConfigurationLastRun.getState().remember(getRepoIdFromWorktreeId(worktreeId), config.id)
  }
}

useRunConfigurationLastRun.subscribe((state, previous) => {
  if (state.lastDotnetByRepo === previous.lastDotnetByRepo) {
    return
  }
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state.lastDotnetByRepo))
  } catch {
    // Storage full or unavailable; the choice still holds for this session.
  }
})
