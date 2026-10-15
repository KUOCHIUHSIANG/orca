#!/usr/bin/env node
// Builds an arm64-only Orca.app into dist/mac-arm64 for local use on Apple Silicon.
//
//   node config/scripts/fork-maintenance/build-mac-local-arm64.mjs
//
// Differs from `pnpm build:mac` in three ways:
// - native Swift helpers build single-arch (arm64 only);
// - packages only `--mac zip --arm64` (no DMG, no x64 slice, no install:release needed);
// - reuses node_modules/electron/dist instead of re-downloading Electron from GitHub.
import { execFileSync } from 'node:child_process'
import { chmodSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'
import {
  BUILD_TIMING_PREFIX,
  createProgressReporter,
  gitCommonDir,
  STARTED_AT_ENV
} from './build-progress.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.error('[build-mac-local-arm64] Only for Apple Silicon Macs.')
  process.exit(1)
}

// Why read build:desktop instead of copying it: upstream reshapes it between releases (v1.4.226
// replaced build:relay with build:wsl-guest). Mobile deps are not installed locally, so skip that step.
const MOBILE_WEB_STEP = 'pnpm run build:mobile-web'
const packageScripts = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts
const steps = [
  ...packageScripts['build:desktop']
    .split('&&')
    .map((part) => part.trim())
    .filter((step) => step !== MOBILE_WEB_STEP),
  'node config/scripts/build-computer-macos.mjs',
  'node config/scripts/build-keyboard-layout-macos.mjs --single-arch',
  'node config/scripts/build-notification-status-macos.mjs --single-arch',
  'pnpm run ensure:electron-runtime'
]
const PACKAGE_STEP = 'electron-builder'
// First-run guesses for the status bar's "time left"; measured durations replace them afterwards.
const STEP_DEFAULT_MS = {
  'pnpm run typecheck': 90_000,
  'pnpm run build:cli': 40_000,
  'pnpm run build:electron-vite': 240_000,
  'pnpm run build:web-from-renderer': 60_000,
  [PACKAGE_STEP]: 150_000
}
// Set only when the sync script runs this build, i.e. after an upstream update.
const sharedStartedAt = Number(process.env[STARTED_AT_ENV])
const timingPrefix =
  sharedStartedAt > 0 ? BUILD_TIMING_PREFIX.afterSync : BUILD_TIMING_PREFIX.standalone
const progress = createProgressReporter({
  gitDir: gitCommonDir(repoRoot),
  phase: 'build',
  steps: [...steps, PACKAGE_STEP].map((step) => ({
    key: `${timingPrefix}${step}`,
    defaultMs: STEP_DEFAULT_MS[step] ?? 20_000
  })),
  startedAt: sharedStartedAt > 0 ? sharedStartedAt : Date.now(),
  totalKey: `${timingPrefix}total`
})

function fail(message) {
  progress.finish('failed')
  console.error(`\n[build-mac-local-arm64] ${message}`)
  process.exit(1)
}

function run(command, args, env = process.env) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  try {
    execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit', env })
  } catch (error) {
    // Why: Orca's update card shows only the stderr tail; an uncaught stack trace hides the failed step.
    fail(`${command} ${args.join(' ')} failed (exit ${error.status ?? error.signal}).`)
  }
}

for (const step of steps) {
  progress.step(`${timingPrefix}${step}`)
  const [command, ...args] = step.split(/\s+/)
  run(command, args)
}

const electronDist = path.join(repoRoot, 'node_modules', 'electron', 'dist')
const bundledElectron = readFileSync(path.join(electronDist, 'version'), 'utf8').trim()
const requiredElectron = JSON.parse(
  readFileSync(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8')
).version
if (bundledElectron !== requiredElectron) {
  fail(
    `node_modules/electron/dist is ${bundledElectron}, expected ${requiredElectron}. Run pnpm install.`
  )
}

// pnpm can leave Electron's unpacked dist read-only; electron-builder copies those modes into
// the app and then fails writing a helper's Info.plist (EACCES).
for (const entry of readdirSync(electronDist, { recursive: true, withFileTypes: true })) {
  const entryPath = path.join(entry.parentPath, entry.name)
  if (!entry.isSymbolicLink()) {
    chmodSync(entryPath, lstatSync(entryPath).mode | 0o200)
  }
}

const identity = getLocalBuildIdentity()
const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: repoRoot, encoding: 'utf8' }).trim()
const forkSource = {
  repoRoot,
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  baseTag: git('describe', '--tags', '--abbrev=0', '--match', 'v*', '--exclude', '*-*', 'HEAD'),
  upstreamRemote: 'upstream',
  forkRemote: 'origin'
}
console.log(`\n[build-mac-local-arm64] version ${identity.version}, base ${forkSource.baseTag}`)
progress.step(`${timingPrefix}${PACKAGE_STEP}`)
run(
  'pnpm',
  [
    'exec',
    'electron-builder',
    '--config',
    'config/scripts/fork-maintenance/electron-builder-local-arm64.config.cjs',
    '--mac',
    'zip',
    '--arm64',
    '--publish',
    'never',
    `-c.electronDist=${electronDist}`,
    ...Object.entries(forkSource).map(
      ([key, value]) => `-c.extraMetadata.orcaForkSource.${key}=${value}`
    )
  ],
  {
    ...process.env,
    ORCA_BUILD_COMMIT: identity.commit,
    ORCA_LOCAL_BUILD_VERSION: identity.version
  }
)
progress.finish('done')
console.log(
  '\n[build-mac-local-arm64] Done: dist/mac-arm64/Orca.app, dist/latest-mac.yml (+ zip for in-app install)'
)
