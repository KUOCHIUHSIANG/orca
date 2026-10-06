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

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.error('[build-mac-local-arm64] Only for Apple Silicon Macs.')
  process.exit(1)
}

function run(command, args, env = process.env) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit', env })
}

run('pnpm', ['run', 'build:desktop'])
run('node', ['config/scripts/build-computer-macos.mjs'])
run('node', ['config/scripts/build-keyboard-layout-macos.mjs', '--single-arch'])
run('node', ['config/scripts/build-notification-status-macos.mjs', '--single-arch'])
run('pnpm', ['run', 'ensure:electron-runtime'])

const electronDist = path.join(repoRoot, 'node_modules', 'electron', 'dist')
const bundledElectron = readFileSync(path.join(electronDist, 'version'), 'utf8').trim()
const requiredElectron = JSON.parse(
  readFileSync(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8')
).version
if (bundledElectron !== requiredElectron) {
  console.error(
    `[build-mac-local-arm64] node_modules/electron/dist is ${bundledElectron}, expected ${requiredElectron}. Run pnpm install.`
  )
  process.exit(1)
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
console.log(
  '\n[build-mac-local-arm64] Done: dist/mac-arm64/Orca.app, dist/latest-mac.yml (+ zip for in-app install)'
)
