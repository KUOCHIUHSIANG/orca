import type { RemoteIdentity } from '../../shared/server-files-types'

/** Read-only: who the login is and which shell it uses. */
export const SESSION_PROBE_COMMAND = [
  'LC_ALL=C; export LC_ALL',
  `printf 'uid=%s\\n' "$(id -u)"`,
  `printf 'gids=%s\\n' "$(id -G)"`,
  `printf 'user=%s\\n' "$(id -un)"`,
  `printf 'groups=%s\\n' "$(id -Gn)"`,
  `printf 'shell=%s\\n' "\${SHELL:-}"`
].join('; ')

export type SessionProbe = { identity: RemoteIdentity | null; loginShell: string | null }

function parseIds(value: string | undefined): number[] | null {
  if (value === undefined) {
    return null
  }
  const ids = value.trim().split(/\s+/).filter(Boolean).map(Number)
  return ids.length > 0 && ids.every((id) => Number.isInteger(id) && id >= 0) ? ids : null
}

export function readSessionProbe(output: string): SessionProbe {
  const fields = new Map<string, string>()
  for (const line of output.split('\n')) {
    const separator = line.indexOf('=')
    if (separator > 0) {
      fields.set(line.slice(0, separator), line.slice(separator + 1).trim())
    }
  }
  const uid = parseIds(fields.get('uid'))
  const gids = parseIds(fields.get('gids'))
  const shellPath = fields.get('shell') ?? ''
  const loginShell = shellPath ? (shellPath.split('/').pop() ?? null) : null
  if (!uid || uid.length !== 1 || !gids) {
    return { identity: null, loginShell }
  }
  return {
    identity: {
      uid: uid[0],
      gids,
      userName: fields.get('user') || String(uid[0]),
      groupNames: (fields.get('groups') ?? '').split(/\s+/).filter(Boolean)
    },
    loginShell
  }
}
