import { app, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runProcess } from '@orca/process-host'

/** Default-browser app name → its user-data folder under ~/Library/Application Support. */
const CHROMIUM_USER_DATA_DIRS: Record<string, string> = {
  'Google Chrome': 'Google/Chrome',
  'Google Chrome Beta': 'Google/Chrome Beta',
  'Google Chrome Dev': 'Google/Chrome Dev',
  'Google Chrome Canary': 'Google/Chrome Canary',
  'Microsoft Edge': 'Microsoft Edge',
  'Brave Browser': 'BraveSoftware/Brave-Browser'
}
// Why strict: the value becomes a browser flag, so accept only Chromium's own folder names.
const PROFILE_DIRECTORY = /^(?:Default|Profile \d+)$/
const OPEN_TIMEOUT_MS = 10_000

/** The profile folder Chromium recorded as last focused, from its `Local State` JSON. */
export function readLastUsedChromiumProfile(localState: unknown): string | null {
  const profile: unknown =
    localState && typeof localState === 'object' ? Reflect.get(localState, 'profile') : undefined
  const lastUsed: unknown =
    profile && typeof profile === 'object' ? Reflect.get(profile, 'last_used') : undefined
  return typeof lastUsed === 'string' && PROFILE_DIRECTORY.test(lastUsed) ? lastUsed : null
}

async function resolveLastUsedChromiumProfile(
  url: string
): Promise<{ appPath: string; profile: string } | null> {
  const browser = await app.getApplicationInfoForProtocol(url)
  const userDataDir = CHROMIUM_USER_DATA_DIRS[path.basename(browser.path, '.app')]
  if (!userDataDir) {
    return null
  }
  const localStatePath = path.join(
    app.getPath('home'),
    'Library',
    'Application Support',
    userDataDir,
    'Local State'
  )
  const profile = readLastUsedChromiumProfile(JSON.parse(await readFile(localStatePath, 'utf8')))
  return profile ? { appPath: browser.path, profile } : null
}

/**
 * Opens an http(s) URL in the default browser. Chrome routes links from other apps to a profile
 * window of its own choosing rather than the one last focused, so name that profile explicitly.
 */
export async function openExternalUrlInLastUsedProfile(url: string): Promise<void> {
  if (process.platform === 'darwin') {
    try {
      const target = await resolveLastUsedChromiumProfile(url)
      if (target) {
        // Why `open -n`: a second launch hands its flags to the running browser and exits,
        // and LaunchServices starts it if needed, so Orca never parents the browser.
        const result = await runProcess({
          program: '/usr/bin/open',
          args: [
            '-n',
            '-a',
            target.appPath,
            '--args',
            `--profile-directory=${target.profile}`,
            url
          ],
          timeoutMs: OPEN_TIMEOUT_MS
        })
        if (result.code === 0) {
          return
        }
      }
    } catch {
      // Unknown browser layout or unreadable state; the plain system open still works.
    }
  }
  await shell.openExternal(url)
}
