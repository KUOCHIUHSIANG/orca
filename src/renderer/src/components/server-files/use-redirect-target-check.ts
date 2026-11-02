import { useEffect, useState } from 'react'
import {
  normalizeRemotePath,
  remoteBaseName,
  remoteParentPath
} from '../../../../shared/server-files-paths'

const CHECK_DELAY_MS = 400

/** The file a trailing `> path` writes to, with `~` expanded; null when there is none. */
export function redirectTarget(command: string, homePath: string | null): string | null {
  const match = /(?:^|[^>&\d])>\s*([^\s;&|<>]+)\s*$/.exec(command.trim())
  if (!match) {
    return null
  }
  const raw = match[1]
  const expanded = raw.startsWith('~/') && homePath ? `${homePath}${raw.slice(1)}` : raw
  return normalizeRemotePath(expanded)
}

/** `>` replaces a file without asking; this reads the folder (read-only) to warn first. */
export function useRedirectTargetCheck(
  serverId: string | null,
  command: string,
  homePath: string | null
): string | null {
  const [existing, setExisting] = useState<string | null>(null)
  useEffect(() => {
    const target = serverId ? redirectTarget(command, homePath) : null
    if (!serverId || !target) {
      setExisting(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await window.api.serverFiles.list({ serverId, path: remoteParentPath(target) })
      if (!cancelled) {
        const name = remoteBaseName(target)
        setExisting(
          result.ok && result.value.entries.some((entry) => entry.name === name) ? target : null
        )
      }
    }, CHECK_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [serverId, command, homePath])
  return existing
}
