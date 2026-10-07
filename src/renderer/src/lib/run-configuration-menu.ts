import type { RunConfiguration } from '../../../shared/run-configuration-types'

export type RunConfigurationMenuEntry =
  | { kind: 'item'; config: RunConfiguration }
  | { kind: 'group'; key: string; label: string; configs: RunConfiguration[] }

/** Folds configs sharing a group into one submenu entry, placed where the group first appears. */
export function groupRunConfigurationsForMenu(
  configs: RunConfiguration[]
): RunConfigurationMenuEntry[] {
  const entries: RunConfigurationMenuEntry[] = []
  const groups = new Map<string, RunConfiguration[]>()

  for (const config of configs) {
    if (!config.group) {
      entries.push({ kind: 'item', config })
      continue
    }
    const key = `${config.projectPath}\0${config.group.label}`
    const members = groups.get(key)
    if (members) {
      members.push(config)
      continue
    }
    const created = [config]
    groups.set(key, created)
    entries.push({ kind: 'group', key, label: config.group.label, configs: created })
  }

  // A one-member submenu is just an extra hover; show it flat under its full label.
  return entries.map((entry) =>
    entry.kind === 'group' && entry.configs.length === 1
      ? { kind: 'item', config: entry.configs[0] }
      : entry
  )
}
