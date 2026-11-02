import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeCredentialFileAtomic } from '../credentials/integration-credential-file'
import { getSecretStore } from '../../shared/secret-store'
import { ServerIdSchema } from './server-files-schemas'
import { fail } from './server-files-errors'
import { removeFileIfPresent, serverFilesDirectory } from './server-files-profile-store'

// One file per server, so listing which servers have a password never asks the Keychain.
function passwordsDirectory(): string {
  return join(serverFilesDirectory(), 'server-files-passwords')
}

function passwordPath(serverId: string): string {
  // Ids are validated to [A-Za-z0-9_-], so they can't escape the folder.
  return join(passwordsDirectory(), `${ServerIdSchema.parse(serverId)}.enc`)
}

/** Unlike other integrations there is no plaintext fallback: an unsealable password is refused. */
export function canSealServerPasswords(): boolean {
  const store = getSecretStore()
  return store.isEncryptionAvailable() && store.describeProtectionGap() === null
}

export function hasServerPassword(serverId: string): boolean {
  return existsSync(passwordPath(serverId))
}

export function saveServerPassword(serverId: string, password: string | null): void {
  if (password === null || password === '') {
    removeFileIfPresent(passwordPath(serverId))
    return
  }
  if (!canSealServerPasswords()) {
    fail('invalid', 'This computer cannot encrypt saved passwords, so the password was not saved')
  }
  const directory = passwordsDirectory()
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
  }
  writeCredentialFileAtomic(passwordPath(serverId), getSecretStore().encryptString(password))
}

export function loadServerPassword(serverId: string): string | null {
  const path = passwordPath(serverId)
  if (!existsSync(path)) {
    return null
  }
  try {
    return getSecretStore().decryptString(readFileSync(path))
  } catch {
    return fail('auth-failed', 'The saved password could not be read from the Keychain')
  }
}
