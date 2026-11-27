import { create } from 'zustand'
import type { RunConfiguration } from '../../../shared/run-configuration-types'

// Why localStorage: a per-device menu preference, kept out of the synced persisted-UI schema.
const STORAGE_KEY = 'orca.runConfigurationVisibility'

/** Config id → hidden; holds only choices that differ from the detected default. */
export type RunConfigurationVisibilityOverrides = Readonly<Record<string, boolean>>

type RunConfigurationVisibilityState = {
  overridesByRepo: Readonly<Record<string, RunConfigurationVisibilityOverrides>>
  setHidden: (repoId: string, configs: readonly RunConfiguration[], hidden: boolean) => void
}

export function isRunConfigurationHidden(
  config: RunConfiguration,
  overrides: RunConfigurationVisibilityOverrides | undefined
): boolean {
  return overrides?.[config.id] ?? config.defaultHidden ?? false
}

export function partitionRunConfigurations(
  configs: readonly RunConfiguration[],
  overrides: RunConfigurationVisibilityOverrides | undefined
): { visible: RunConfiguration[]; hidden: RunConfiguration[] } {
  const visible: RunConfiguration[] = []
  const hidden: RunConfiguration[] = []
  for (const config of configs) {
    if (isRunConfigurationHidden(config, overrides)) {
      hidden.push(config)
    } else {
      visible.push(config)
    }
  }
  return { visible, hidden }
}

export function applyRunConfigurationVisibility(
  overrides: RunConfigurationVisibilityOverrides | undefined,
  configs: readonly RunConfiguration[],
  hidden: boolean
): Record<string, boolean> {
  const next = { ...overrides }
  for (const config of configs) {
    if (hidden === (config.defaultHidden ?? false)) {
      delete next[config.id]
    } else {
      next[config.id] = hidden
    }
  }
  return next
}

function readPersisted(): Record<string, RunConfigurationVisibilityOverrides> {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage?.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    const result: Record<string, RunConfigurationVisibilityOverrides> = {}
    for (const [repoId, overrides] of Object.entries(parsed)) {
      if (!overrides || typeof overrides !== 'object') {
        continue
      }
      const valid = Object.entries(overrides).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
      )
      if (valid.length > 0) {
        result[repoId] = Object.fromEntries(valid)
      }
    }
    return result
  } catch {
    return {}
  }
}

export const useRunConfigurationVisibility = create<RunConfigurationVisibilityState>((set) => ({
  overridesByRepo: readPersisted(),
  setHidden: (repoId, configs, hidden) =>
    set((state) => {
      const { [repoId]: current, ...rest } = state.overridesByRepo
      const next = applyRunConfigurationVisibility(current, configs, hidden)
      return {
        overridesByRepo: Object.keys(next).length > 0 ? { ...rest, [repoId]: next } : rest
      }
    })
}))

useRunConfigurationVisibility.subscribe((state, previous) => {
  if (state.overridesByRepo === previous.overridesByRepo) {
    return
  }
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state.overridesByRepo))
  } catch {
    // Storage full or unavailable; the choice still holds for this session.
  }
})
