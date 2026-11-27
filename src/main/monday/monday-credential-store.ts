import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  credentialFileHasContent,
  readStoredCredentialToken,
  writeCredentialFileAtomic,
  writeEncryptedCredential
} from '../credentials/integration-credential-file'
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
  showTaiwanHolidays: boolean
  notifyPersonId: string | null
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
    undatedExpanded: false,
    showTaiwanHolidays: true,
    notifyPersonId: null
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
      config.showTaiwanHolidays = record.showTaiwanHolidays !== false
      config.notifyPersonId =
        typeof record.notifyPersonId === 'string' && /^\d+$/.test(record.notifyPersonId)
          ? record.notifyPersonId
          : null
    }
  } catch {
    // Missing or corrupt config reads as a fresh setup.
  }
  cachedConfig = config
  return config
}

async function writeConfig(config: MondayConfigFile): Promise<void> {
  ensureOrcaDir()
  // Why: cached before the write so an overlapping update merges onto this one, not the old config.
  cachedConfig = config
  await writeCredentialFileAtomic(
    getConfigPath(),
    Buffer.from(JSON.stringify(config, null, 2), 'utf-8')
  )
}

export async function getMondayConnectionStatus(): Promise<MondayConnectionStatus> {
  const config = readConfig()
  return {
    // Why: checks the file only, so opening the page never triggers a keychain prompt.
    connected:
      (config.boardIds.length > 0 || config.docs.length > 0) &&
      (await credentialFileHasContent(getTokenPath())),
    connectedAs: config.connectedAs,
    boardIds: config.boardIds,
    docs: config.docs,
    activeTab: config.activeTab,
    selectedPersonIds: config.selectedPersonIds,
    selectedBoardIds: config.selectedBoardIds,
    boardSettings: config.boardSettings,
    showDone: config.showDone,
    undatedExpanded: config.undatedExpanded,
    showTaiwanHolidays: config.showTaiwanHolidays,
    notifyPersonId: config.notifyPersonId
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

export async function saveMondayConnection(args: {
  apiToken: string
  connectedAs: string | null
  boardIds: string[]
  docs: MondayDocRef[]
}): Promise<void> {
  ensureOrcaDir()
  if (args.apiToken !== cachedToken) {
    await writeEncryptedCredential('Monday', getTokenPath(), args.apiToken)
    cachedToken = args.apiToken
  }
  await writeConfig({
    ...readConfig(),
    connectedAs: args.connectedAs,
    boardIds: args.boardIds,
    docs: args.docs
  })
}

export async function updateMondayPreferences(update: MondayPreferencesUpdate): Promise<void> {
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
  if (update.showTaiwanHolidays !== undefined) {
    next.showTaiwanHolidays = update.showTaiwanHolidays
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
  if (update.notifyPersonId !== undefined) {
    next.notifyPersonId = update.notifyPersonId
  }
  await writeConfig(next)
}

export async function clearMondayConnection(): Promise<void> {
  try {
    unlinkSync(getTokenPath())
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  } finally {
    cachedToken = null
  }
  await writeConfig({ ...readConfig(), connectedAs: null })
}

/** @internal - tests need a clean in-memory cache between cases. */
export function _resetMondayCredentialCache(): void {
  cachedToken = null
  cachedConfig = null
}
