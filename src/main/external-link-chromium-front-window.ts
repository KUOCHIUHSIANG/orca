import { app, shell } from 'electron'
import path from 'node:path'
import { runProcess } from '@orca/process-host'

/** Default-browser app name → bundle id; all share Chromium's AppleScript suite. */
const CHROMIUM_BUNDLE_IDS: Record<string, string> = {
  'Google Chrome': 'com.google.Chrome',
  'Google Chrome Beta': 'com.google.Chrome.beta',
  'Google Chrome Dev': 'com.google.Chrome.dev',
  'Google Chrome Canary': 'com.google.Chrome.canary',
  'Microsoft Edge': 'com.microsoft.edgemac',
  'Brave Browser': 'com.brave.Browser'
}
// Why long: the first call waits on macOS's "Orca wants to control <browser>" consent prompt.
const OPEN_TIMEOUT_MS = 60_000

/** The URL arrives as argv so it is never parsed as AppleScript source. */
function frontWindowOpenScript(bundleId: string): string[] {
  return [
    'on run argv',
    `if application id "${bundleId}" is not running then return "not-running"`,
    `tell application id "${bundleId}"`,
    'repeat with candidate in windows',
    'if mode of candidate is "normal" then',
    'tell candidate to make new tab with properties {URL:item 1 of argv}',
    'set index of candidate to 1',
    'activate',
    'return "opened"',
    'end if',
    'end repeat',
    'end tell',
    'return "no-window"',
    'end run'
  ]
}

async function openInFrontChromiumWindow(url: string): Promise<boolean> {
  const browser = await app.getApplicationInfoForProtocol(url)
  const bundleId = CHROMIUM_BUNDLE_IDS[path.basename(browser.path, '.app')]
  if (!bundleId) {
    return false
  }
  const result = await runProcess({
    program: '/usr/bin/osascript',
    args: [...frontWindowOpenScript(bundleId).flatMap((line) => ['-e', line]), url],
    timeoutMs: OPEN_TIMEOUT_MS
  })
  return result.code === 0 && result.stdout.trim() === 'opened'
}

/**
 * Opens an http(s) URL in the default browser. Chrome routes links from other apps to a profile
 * window of its own choosing, so open the tab in its frontmost (last focused) window instead.
 * Why not `--profile-directory`: macOS guards Chrome's data folder, so `Local State` is unreadable.
 */
export async function openExternalUrlInFrontBrowserWindow(url: string): Promise<void> {
  if (process.platform === 'darwin') {
    try {
      if (await openInFrontChromiumWindow(url)) {
        return
      }
    } catch {
      // Automation denied or unknown browser; the plain system open still works.
    }
  }
  await shell.openExternal(url)
}
