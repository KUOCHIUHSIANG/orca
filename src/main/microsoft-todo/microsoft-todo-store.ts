import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  credentialFileHasContent,
  readStoredCredentialToken,
  writeCredentialFileAtomic,
  writeEncryptedCredential
} from '../credentials/integration-credential-file'
import { asString, isRecord } from '../untrusted-json-guards'
import type { MicrosoftTodoStatus } from '../../shared/microsoft-todo-types'

type TodoConfig = {
  version: 1
  /** The user's own Entra app registration; public client, so this is not a secret. */
  clientId: string | null
  accountName: string | null
  selectedListId: string | null
}

export type MicrosoftTokens = {
  accessToken: string
  refreshToken: string
  /** Epoch ms after which the access token must be refreshed. */
  expiresAt: number
}

let cachedConfig: TodoConfig | null = null
let cachedTokens: MicrosoftTokens | null = null

function orcaDir(): string {
  return join(homedir(), '.orca')
}

function configPath(): string {
  return join(orcaDir(), 'microsoft-todo.json')
}

function tokenPath(): string {
  return join(orcaDir(), 'microsoft-todo-token.enc')
}

function readConfig(): TodoConfig {
  if (cachedConfig) {
    return cachedConfig
  }
  const config: TodoConfig = { version: 1, clientId: null, accountName: null, selectedListId: null }
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath(), 'utf-8'))
    if (isRecord(parsed)) {
      config.clientId = asString(parsed.clientId)
      config.accountName = asString(parsed.accountName)
      config.selectedListId = asString(parsed.selectedListId)
    }
  } catch {
    // Missing or corrupt config reads as a fresh setup.
  }
  cachedConfig = config
  return config
}

async function writeConfig(next: TodoConfig): Promise<void> {
  mkdirSync(orcaDir(), { recursive: true })
  // Why: cached before the write so an overlapping update merges onto this one, not the old config.
  cachedConfig = next
  await writeCredentialFileAtomic(configPath(), Buffer.from(JSON.stringify(next, null, 2), 'utf-8'))
}

export async function getMicrosoftTodoStatus(): Promise<MicrosoftTodoStatus> {
  const config = readConfig()
  return {
    clientIdConfigured: config.clientId !== null,
    // Why: checks the file only, so opening the panel never triggers a keychain prompt.
    signedIn: config.clientId !== null && (await credentialFileHasContent(tokenPath())),
    accountName: config.accountName,
    selectedListId: config.selectedListId
  }
}

export function getMicrosoftTodoClientId(): string | null {
  return readConfig().clientId
}

export async function setMicrosoftTodoClientId(clientId: string): Promise<void> {
  const config = readConfig()
  const changed = config.clientId !== clientId
  if (changed) {
    // Why: tokens minted for another app registration are useless with the new one.
    clearMicrosoftTokens()
  }
  await writeConfig({ ...config, clientId, accountName: changed ? null : config.accountName })
}

export async function setMicrosoftTodoAccount(accountName: string | null): Promise<void> {
  await writeConfig({ ...readConfig(), accountName })
}

export async function setMicrosoftTodoSelectedList(listId: string | null): Promise<void> {
  await writeConfig({ ...readConfig(), selectedListId: listId })
}

/** Throws CredentialDecryptionError when the keychain refuses to decrypt. */
export function loadMicrosoftTokens(): MicrosoftTokens | null {
  if (cachedTokens) {
    return cachedTokens
  }
  if (!existsSync(tokenPath())) {
    return null
  }
  const raw = readStoredCredentialToken('Microsoft To Do', readFileSync(tokenPath()))
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || typeof parsed.expiresAt !== 'number') {
      return null
    }
    const accessToken = asString(parsed.accessToken)
    const refreshToken = asString(parsed.refreshToken)
    if (!accessToken || !refreshToken) {
      return null
    }
    cachedTokens = { accessToken, refreshToken, expiresAt: parsed.expiresAt }
    return cachedTokens
  } catch {
    return null
  }
}

export async function saveMicrosoftTokens(tokens: MicrosoftTokens): Promise<void> {
  mkdirSync(orcaDir(), { recursive: true })
  await writeEncryptedCredential('Microsoft To Do', tokenPath(), JSON.stringify(tokens))
  cachedTokens = tokens
}

export function clearMicrosoftTokens(): void {
  cachedTokens = null
  try {
    unlinkSync(tokenPath())
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
}

/** @internal - tests need a clean in-memory cache between cases. */
export function _resetMicrosoftTodoStore(): void {
  cachedConfig = null
  cachedTokens = null
}
