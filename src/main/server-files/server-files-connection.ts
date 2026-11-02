import type { SshTarget } from '../../shared/ssh-types'
import type { ServerProfile } from '../../shared/server-files-types'
import { getCurrentMainWindow } from '../ipc/ssh/ssh-ipc-context'
import { requestCredential } from '../ipc/ssh/ssh-passphrase'
import { SshConnection } from '../ssh/connection/ssh-connection'
import { execCommand } from '../ssh/remote-exec/remote-exec-command'
import { loadServerPassword } from './server-files-password-store'
import type { ServerFilesConnection } from './server-files-sessions'

export const SERVER_FILES_TARGET_PREFIX = 'server-files-'

/** An in-memory target: never stored with Orca's SSH hosts, so nothing offers to deploy to it. */
export function profileToSshTarget(profile: ServerProfile): SshTarget {
  const id = `${SERVER_FILES_TARGET_PREFIX}${profile.id}`
  const identity =
    profile.auth === 'key' && profile.identityFile ? { identityFile: profile.identityFile } : {}
  if (profile.endpoint.kind === 'ssh-config') {
    const { alias } = profile.endpoint
    return {
      id,
      label: alias,
      configHost: alias,
      host: alias,
      port: 22,
      username: '',
      source: 'ssh-config',
      reconnectOnLaunch: false,
      ...identity
    }
  }
  return {
    id,
    // ssh -G resolves the label, so Host patterns matching the hostname still apply.
    label: profile.endpoint.host,
    host: profile.endpoint.host,
    port: profile.endpoint.port,
    username: profile.endpoint.username,
    source: 'manual',
    reconnectOnLaunch: false,
    ...identity
  }
}

/**
 * A plain SshConnection: connect() only resolves config, checks the host key and signs in. It is
 * deliberately not the SshConnectionManager / ssh:connect path, which is what deploys orcad.
 */
export function createServerFilesConnection(profile: ServerProfile): ServerFilesConnection {
  const password = profile.auth === 'password' ? loadServerPassword(profile.id) : null
  const connection = new SshConnection(
    profileToSshTarget(profile),
    {
      // Not broadcast: Settings → SSH must never see these connections as its own.
      onStateChange: () => undefined,
      onCredentialRequest: (targetId, kind, detail, echo, signal) =>
        requestCredential(getCurrentMainWindow, targetId, kind, detail, echo, signal)
    },
    password ? { password, passphrase: null } : undefined
  )
  return {
    connect: () => connection.connect(),
    disconnect: () => connection.disconnect({ quiet: true }),
    usesSystemSshTransport: () => connection.usesSystemSshTransport(),
    sftp: () => connection.sftp(),
    run: (command, options) => execCommand(connection, command, options)
  }
}
