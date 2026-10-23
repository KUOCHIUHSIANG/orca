#!/usr/bin/env node
// Restarts the running Orca into the fresh local build in dist/mac-arm64.
//
//   node config/scripts/fork-maintenance/reinstall-local-build.mjs [--build]
//
// --build runs build-mac-local-arm64.mjs first, so the status bar goes straight from the build bar
// to "restarting". Like the official updater's ShipIt step, the installed bundle is only replaced
// after the old process has exited. The restart half detaches because this usually runs inside an
// Orca terminal; it logs to .git/orca-reinstall.log.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, openSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { gitCommonDir, markRestartDone, markRestarting } from './build-progress.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
const INSTALLED_APP = '/Applications/Orca.app'
const INSTALLED_EXE = `${INSTALLED_APP}/Contents/MacOS/Orca`
const BUILT_APP = path.join(repoRoot, 'dist', 'mac-arm64', 'Orca.app')
const LOG_FILE = 'orca-reinstall.log'
const DETACHED_FLAG = '--detached-restart'
// Why: Orca polls the progress file every 2 s, so quitting at once would hide the notice.
const NOTICE_MS = 5_000
const QUIT_HINT_MS = 15_000
const QUIT_TIMEOUT_MS = 10 * 60 * 1000

const log = (message) => console.log(`[reinstall-local-build] ${message}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fail(message) {
  console.error(`[reinstall-local-build] ${message}`)
  process.exit(1)
}

/** Matches the main process only; helpers live under Contents/Frameworks. */
function runningOrcaPid() {
  const ps = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  for (const line of ps.split('\n')) {
    const [pid, command] = line.trim().split(/\s+/, 2)
    if (command === INSTALLED_EXE) {
      return Number(pid)
    }
  }
  return null
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** Stage a full copy first so a failed copy never leaves /Applications without Orca. */
function swapInstalledApp() {
  const staging = `${INSTALLED_APP}.updating`
  const previous = `${INSTALLED_APP}.old`
  rmSync(staging, { recursive: true, force: true })
  rmSync(previous, { recursive: true, force: true })
  execFileSync('ditto', [BUILT_APP, staging])
  renameSync(INSTALLED_APP, previous)
  try {
    renameSync(staging, INSTALLED_APP)
  } catch (error) {
    renameSync(previous, INSTALLED_APP)
    throw error
  }
  rmSync(previous, { recursive: true, force: true })
}

async function restart(oldPid) {
  const gitDir = gitCommonDir(repoRoot)
  markRestarting(gitDir, process.pid)
  log(
    `${new Date().toISOString()} notice shown; quitting Orca (pid ${oldPid}) in ${NOTICE_MS / 1000}s`
  )
  await sleep(NOTICE_MS)
  const bundleId = execFileSync(
    'plutil',
    ['-extract', 'CFBundleIdentifier', 'raw', `${INSTALLED_APP}/Contents/Info.plist`],
    { encoding: 'utf8' }
  ).trim()
  // Why not wait on osascript: a quit-confirmation dialog would block it, and the exit is what counts.
  spawn('osascript', ['-e', `tell application id "${bundleId}" to quit`], { stdio: 'ignore' })

  const quitAt = Date.now()
  let hinted = false
  while (isAlive(oldPid)) {
    const waited = Date.now() - quitAt
    if (waited > QUIT_TIMEOUT_MS) {
      log('Orca never exited; the installed app was left untouched.')
      process.exit(2)
    }
    if (!hinted && waited > QUIT_HINT_MS) {
      hinted = true
      log('Orca is still running: confirm its quit dialog, or right-click the Dock icon → Quit.')
    }
    await sleep(500)
  }
  log(`${new Date().toISOString()} Orca exited; installing the new build`)
  markRestartDone(gitDir)
  swapInstalledApp()
  execFileSync('open', [INSTALLED_APP])
  log(`${new Date().toISOString()} done`)
}

function start() {
  if (process.platform !== 'darwin') {
    fail('Only for macOS.')
  }
  if (process.argv.includes('--build')) {
    execFileSync(process.execPath, [path.join(import.meta.dirname, 'build-mac-local-arm64.mjs')], {
      cwd: repoRoot,
      stdio: 'inherit'
    })
  }
  if (!existsSync(path.join(BUILT_APP, 'Contents', 'MacOS', 'Orca'))) {
    fail(`No build at ${BUILT_APP}; run with --build.`)
  }
  // Why stop instead of installing: a missed process match once swapped the bundle under a live app.
  const oldPid = runningOrcaPid()
  if (!oldPid) {
    fail(`Orca is not running from ${INSTALLED_APP}; nothing was changed.`)
  }
  const logPath = path.join(gitCommonDir(repoRoot), LOG_FILE)
  const output = openSync(logPath, 'a')
  const child = spawn(process.execPath, [import.meta.filename, DETACHED_FLAG, String(oldPid)], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', output, output]
  })
  child.unref()
  log(`Restarting Orca (pid ${oldPid}) in the background; log: ${logPath}`)
}

const detachedIndex = process.argv.indexOf(DETACHED_FLAG)
if (detachedIndex === -1) {
  start()
} else {
  restart(Number(process.argv[detachedIndex + 1])).catch((error) => {
    log(`failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
