import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  credentialFileHasContent,
  readStoredCredentialToken,
  writeCredentialFileAtomic,
  writeEncryptedCredential
} from '../integration-credential-file'
import {
  parseMondayBoardDisplaySettings,
  type MondayBoardDisplaySettings,
  type MondayConnectionStatus,
  type MondayDocRef,
  type MondayPageTab,
  type MondayPreferencesUpdate
} from '../../shared/monday-calendar-types'

type MondayConfigFile = {
  version: 1
  connectedAs: string | null
  boardIds: string[]
  docs: MondayDocRef[]
  activeTab: MondayPageTab
  selectedPersonIds: string[] | null
  selectedBoardIds: string[] | null
  boardSettings: MondayBoardDisplaySettings
  showDone: boolean
  undatedExpanded: boolean
}

let cachedToken: string | null = null
let cachedConfig: MondayConfigFile | null = null

function getOrcaDir(): string {
  return join(homedir(), '.orca')
}

function getTokenPath(): string {
  return join(getOrcaDir(), 'monday-token.enc')
}

function getConfigPath(): string {
  return join(getOrcaDir(), 'monday-calendar.json')
}

function ensureOrcaDir(): void {
  const dir = getOrcaDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null
}

function readDocRefs(value: unknown): MondayDocRef[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) {
      return []
    }
    const record: Record<string, unknown> = { ...entry }
    const { objectId, url } = record
    return typeof objectId === 'string' && /^\d+$/.test(objectId) && typeof url === 'string'
      ? [{ objectId, url }]
      : []
  })
}

function emptyConfig(): MondayConfigFile {
  return {
    version: 1,
    connectedAs: null,
    boardIds: [],
    docs: [],
    activeTab: 'calendar',
    selectedPersonIds: null,
    selectedBoardIds: null,
    boardSettings: {},
    showDone: false,
    undatedExpanded: false
  }
}

function readConfig(): MondayConfigFile {
  if (cachedConfig) {
    return cachedConfig
  }
  const config = emptyConfig()
  try {
    const parsed: unknown = JSON.parse(readFileSync(getConfigPath(), 'utf-8'))
    if (parsed && typeof parsed === 'object') {
      const record: Record<string, unknown> = { ...parsed }
      config.connectedAs = typeof record.connectedAs === 'string' ? record.connectedAs : null
      config.boardIds = asStringArray(record.boardIds) ?? []
      config.docs = readDocRefs(record.docs)
      config.activeTab = record.activeTab === 'docs' ? 'docs' : 'calendar'
      config.selectedPersonIds = asStringArray(record.selectedPersonIds)
      config.selectedBoardIds = asStringArray(record.selectedBoardIds)
      config.boardSettings = parseMondayBoardDisplaySettings(record.boardSettings)
      config.showDone = record.showDone === true
      config.undatedExpanded = record.undatedExpanded === true
    }
  } catch {
    // Missing or corrupt config reads as a fresh setup.
  }
  cachedConfig = config
  return config
}

function writeConfig(config: MondayConfigFile): void {
  ensureOrcaDir()
  writeCredentialFileAtomic(getConfigPath(), Buffer.from(JSON.stringify(config, null, 2), 'utf-8'))
  cachedConfig = config
}

export function getMondayConnectionStatus(): MondayConnectionStatus {
  const config = readConfig()
  return {
    // Why: checks the file only, so opening the page never triggers a keychain prompt.
    connected:
      credentialFileHasContent(getTokenPath()) &&
      (config.boardIds.length > 0 || config.docs.length > 0),
    connectedAs: config.connectedAs,
    boardIds: config.boardIds,
    docs: config.docs,
    activeTab: config.activeTab,
    selectedPersonIds: config.selectedPersonIds,
    selectedBoardIds: config.selectedBoardIds,
    boardSettings: config.boardSettings,
    showDone: config.showDone,
    undatedExpanded: config.undatedExpanded
  }
}

/** Throws CredentialDecryptionError when the keychain refuses to decrypt. */
export function loadMondayToken(): string | null {
  if (cachedToken !== null) {
    return cachedToken
  }
  const path = getTokenPath()
  if (!existsSync(path)) {
    return null
  }
  cachedToken = readStoredCredentialToken('Monday', readFileSync(path))
  return cachedToken
}

export function saveMondayConnection(args: {
  apiToken: string
  connectedAs: string | null
  boardIds: string[]
  docs: MondayDocRef[]
}): void {
  ensureOrcaDir()
  if (args.apiToken !== cachedToken) {
    writeEncryptedCredential('Monday', getTokenPath(), args.apiToken)
    cachedToken = args.apiToken
  }
  writeConfig({
    ...readConfig(),
    connectedAs: args.connectedAs,
    boardIds: args.boardIds,
    docs: args.docs
  })
}

export function updateMondayPreferences(update: MondayPreferencesUpdate): void {
  const next = { ...readConfig() }
  if (update.selectedPersonIds !== undefined) {
    next.selectedPersonIds = update.selectedPersonIds
  }
  if (update.selectedBoardIds !== undefined) {
    next.selectedBoardIds = update.selectedBoardIds
  }
  if (update.activeTab !== undefined) {
    next.activeTab = update.activeTab
  }
  if (update.boardSettings !== undefined) {
    next.boardSettings = update.boardSettings
  }
  if (update.showDone !== undefined) {
    next.showDone = update.showDone
  }
  if (update.undatedExpanded !== undefined) {
    next.undatedExpanded = update.undatedExpanded
  }
  writeConfig(next)
}

export function clearMondayConnection(): void {
  try {
    unlinkSync(getTokenPath())
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  } finally {
    cachedToken = null
  }
  writeConfig({ ...readConfig(), connectedAs: null })
}

/** @internal - tests need a clean in-memory cache between cases. */
export function _resetMondayCredentialCache(): void {
  cachedToken = null
  cachedConfig = null
}
