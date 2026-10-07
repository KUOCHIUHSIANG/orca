import { parse } from 'jsonc-parser'

export type DotnetLaunchProfile = {
  name: string
  /** First entry of applicationUrl, e.g. "https://localhost:7182" */
  applicationUrl: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstApplicationUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  return (
    value
      .split(';')
      .map((url) => url.trim())
      .find(Boolean) ?? null
  )
}

/** Parses Properties/launchSettings.json (JSONC, often BOM-prefixed) into runnable profiles. */
export function parseDotnetLaunchProfiles(content: string): DotnetLaunchProfile[] {
  const parsed: unknown = parse(content.replace(/^\uFEFF/, ''), [], { allowTrailingComma: true })
  if (!isRecord(parsed) || !isRecord(parsed['profiles'])) {
    return []
  }

  const profiles: DotnetLaunchProfile[] = []
  for (const [name, profile] of Object.entries(parsed['profiles'])) {
    // `dotnet run --launch-profile` rejects IISExpress/Docker/Executable profiles.
    if (!isRecord(profile) || profile['commandName'] !== 'Project') {
      continue
    }
    profiles.push({ name, applicationUrl: firstApplicationUrl(profile['applicationUrl']) })
  }
  return profiles
}
