import type { WorkspacePort } from '../../../shared/workspace-ports'

export type PortAddressFamily = 'IPv4' | 'IPv6'

export type WorkspacePortListener = {
  bindHost: string
  family: PortAddressFamily | null
}

export type WorkspacePortListenerGroup = {
  key: string
  /** Listener the row's open/copy/stop actions use; every member shares port and process. */
  port: WorkspacePort
  listeners: WorkspacePortListener[]
}

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

/** Null for wildcard (`*`) binds, whose family the OS listing doesn't report. */
export function addressFamilyForBindHost(bindHost: string): PortAddressFamily | null {
  if (bindHost.includes(':')) {
    return 'IPv6'
  }
  return IPV4_RE.test(bindHost) ? 'IPv4' : null
}

export function formatBindAddress(bindHost: string, port: number): string {
  return bindHost.includes(':') ? `[${bindHost}]:${port}` : `${bindHost}:${port}`
}

/** "IPv4/IPv6" style tag for a merged row, or null when no family is known. */
export function addressFamilyTag(listeners: readonly WorkspacePortListener[]): string | null {
  const families = (['IPv4', 'IPv6'] as const).filter((family) =>
    listeners.some((listener) => listener.family === family)
  )
  return families.length > 0 ? families.join('/') : null
}

/**
 * Folds one process's listeners on the same port into a single row. Servers bound to
 * `localhost` (e.g. Kestrel) open both 127.0.0.1 and ::1, which otherwise list twice.
 */
export function groupWorkspacePortListeners(
  ports: readonly WorkspacePort[]
): WorkspacePortListenerGroup[] {
  const groups = new Map<string, WorkspacePortListenerGroup>()
  for (const port of ports) {
    // Without a pid or name the owner is unknown, so never merge it.
    const owner = port.pid ?? port.processName ?? `id:${port.id}`
    const key = `${port.port}\0${owner}`
    const listener = { bindHost: port.bindHost, family: addressFamilyForBindHost(port.bindHost) }
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { key, port, listeners: [listener] })
      continue
    }
    group.listeners.push(listener)
    // Why: the terminal-advertised URL is what open/copy should use when one listener has it.
    if (port.kind === 'workspace' && port.advertisedUrl && !hasAdvertisedUrl(group.port)) {
      group.port = port
    }
  }
  for (const group of groups.values()) {
    group.listeners.sort((a, b) => familyRank(a.family) - familyRank(b.family))
  }
  return [...groups.values()]
}

function familyRank(family: PortAddressFamily | null): number {
  return family === 'IPv4' ? 0 : family === 'IPv6' ? 1 : 2
}

function hasAdvertisedUrl(port: WorkspacePort): boolean {
  return port.kind === 'workspace' && Boolean(port.advertisedUrl)
}
