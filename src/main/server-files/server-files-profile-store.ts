import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { writeCredentialFileAtomic } from '../credentials/integration-credential-file'
import { normalizeProtectedPaths, normalizeRemotePath } from '../../shared/server-files-paths'
import type { ServerProfile } from '../../shared/server-files-types'
import { ServerProfileSchema } from './server-files-schemas'

type ProfileFile = { version: 1; profiles: ServerProfile[] }

let cachedProfiles: ServerProfile[] | null = null

export function serverFilesDirectory(): string {
  return join(homedir(), '.orca')
}

function profilesPath(): string {
  return join(serverFilesDirectory(), 'server-files.json')
}

function ensureDirectory(): void {
  const dir = serverFilesDirectory()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function normalizeProfile(profile: ServerProfile): ServerProfile {
  const normalizeOptional = (value: string): string =>
    value === '' ? '' : (normalizeRemotePath(value) ?? '')
  return {
    ...profile,
    startPath: normalizeOptional(profile.startPath),
    protectedPaths: normalizeProtectedPaths(profile.protectedPaths),
    projects: profile.projects.map((project) => ({
      ...project,
      projectPath: normalizeOptional(project.projectPath),
      backupPath: normalizeOptional(project.backupPath)
    }))
  }
}

export function listServerProfiles(): ServerProfile[] {
  if (cachedProfiles) {
    return cachedProfiles
  }
  let profiles: ServerProfile[] = []
  try {
    const parsed: unknown = JSON.parse(readFileSync(profilesPath(), 'utf-8'))
    const list =
      typeof parsed === 'object' && parsed !== null && 'profiles' in parsed ? parsed.profiles : []
    profiles = (Array.isArray(list) ? list : []).flatMap((entry: unknown) => {
      const result = ServerProfileSchema.safeParse(entry)
      return result.success ? [normalizeProfile(result.data)] : []
    })
  } catch {
    // A missing or unreadable file reads as no servers yet.
  }
  cachedProfiles = profiles
  return profiles
}

export function getServerProfile(id: string): ServerProfile | null {
  return listServerProfiles().find((profile) => profile.id === id) ?? null
}

function writeProfiles(profiles: ServerProfile[]): void {
  ensureDirectory()
  const file: ProfileFile = { version: 1, profiles }
  writeCredentialFileAtomic(profilesPath(), Buffer.from(JSON.stringify(file, null, 2), 'utf-8'))
  cachedProfiles = profiles
}

export function saveServerProfile(profile: ServerProfile): ServerProfile {
  const normalized = normalizeProfile(profile)
  const profiles = listServerProfiles()
  const index = profiles.findIndex((existing) => existing.id === normalized.id)
  writeProfiles(
    index === -1
      ? [...profiles, normalized]
      : profiles.map((existing, i) => (i === index ? normalized : existing))
  )
  return normalized
}

export function deleteServerProfile(id: string): void {
  writeProfiles(listServerProfiles().filter((profile) => profile.id !== id))
}

export function removeFileIfPresent(path: string): void {
  try {
    unlinkSync(path)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
}

export function _resetServerProfilesCacheForTests(): void {
  cachedProfiles = null
}
