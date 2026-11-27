#!/usr/bin/env node
// Three-way merge for the i18n locale catalogs, run by git as a merge driver during syncs.
// Upstream and the fork both add keys to the same catalogs every release; a line merge reports
// those as conflicts although they never touch the same key, and each one cost a Claude run.
//
//   node locale-json-merge.mjs <base> <ours> <theirs>        (git passes %O %A %B)
//
// Writes the merge into <ours>. When both sides changed one key differently, git's own line
// merge with conflict markers is written instead (exit 1), so the sync hands it to Claude as before.
// Self-contained on purpose: the sync copies it into the git dir, since mid-rebase the worktree
// may predate the commit that added this file.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const DRIVER = 'orca-locale-json'
const MERGE_RULES = [
  `src/renderer/src/i18n/locales/*.json merge=${DRIVER}`,
  `src/renderer/src/i18n/en-runtime-required.json merge=${DRIVER}`,
  // A generated, sorted catalog: keeping both sides' added lines is right, and the sync's typecheck
  // catches the rare clash.
  'src/shared/rpc-contract/rpc-params-catalog.generated.ts merge=union'
]

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `ours` order first; a key only `theirs` has goes right after its preceding key in `theirs`. */
function mergedKeyOrder(ours, theirs) {
  const keys = Object.keys(ours)
  let anchor = -1
  for (const key of Object.keys(theirs)) {
    const at = keys.indexOf(key)
    if (at !== -1) {
      anchor = at
      continue
    }
    keys.splice(anchor + 1, 0, key)
    anchor += 1
  }
  return keys
}

function mergeValue(base, ours, theirs, keyPath, conflicts) {
  if (isDeepStrictEqual(ours, theirs) || isDeepStrictEqual(base, theirs)) {
    return ours
  }
  if (isDeepStrictEqual(base, ours)) {
    return theirs
  }
  if (isObject(ours) && isObject(theirs)) {
    return mergeObjects(isObject(base) ? base : {}, ours, theirs, keyPath, conflicts)
  }
  conflicts.push(keyPath.join('.'))
  return ours
}

function mergeObjects(base, ours, theirs, keyPath, conflicts) {
  const merged = {}
  for (const key of mergedKeyOrder(ours, theirs)) {
    const value = mergeValue(base[key], ours[key], theirs[key], [...keyPath, key], conflicts)
    // An absent result means a side deleted the key and the other left it alone.
    if (value !== undefined) {
      merged[key] = value
    }
  }
  return merged
}

/** Returns `{ text }` with the merged catalog, or `{ conflicts }` naming the keys both sides changed. */
export function mergeLocaleJson(baseText, oursText, theirsText) {
  let base
  let ours
  let theirs
  try {
    base = baseText.trim() ? JSON.parse(baseText) : {}
    ours = JSON.parse(oursText)
    theirs = JSON.parse(theirsText)
  } catch {
    return { conflicts: ['(not valid JSON)'] }
  }
  if (!isObject(base) || !isObject(ours) || !isObject(theirs)) {
    return { conflicts: ['(not a JSON object)'] }
  }
  const conflicts = []
  const merged = mergeObjects(base, ours, theirs, [], conflicts)
  return conflicts.length > 0 ? { conflicts } : { text: `${JSON.stringify(merged, null, 2)}\n` }
}

/**
 * Registers the sync's merge rules (this driver for the catalogs, git's union for a generated
 * file) in this clone's own git config and info/attributes, shared by its worktrees; nothing
 * committed, so no upstream file changes.
 */
export function installSyncMergeRules(cwd) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const commonDir = path.resolve(cwd, git('rev-parse', '--git-common-dir'))
  const driverCopy = path.join(commonDir, 'orca-locale-json-merge.mjs')
  copyFileSync(import.meta.filename, driverCopy)
  git('config', `merge.${DRIVER}.name`, 'Orca locale catalog key merge')
  git('config', `merge.${DRIVER}.driver`, `node "${driverCopy}" %O %A %B`)
  const attributes = path.join(commonDir, 'info', 'attributes')
  const current = existsSync(attributes) ? readFileSync(attributes, 'utf8') : ''
  const missing = MERGE_RULES.filter((rule) => !current.split('\n').includes(rule))
  if (missing.length > 0) {
    mkdirSync(path.dirname(attributes), { recursive: true })
    const separator = current && !current.endsWith('\n') ? '\n' : ''
    writeFileSync(attributes, `${current}${separator}${missing.join('\n')}\n`)
  }
}

function runAsMergeDriver([basePath, oursPath, theirsPath]) {
  const result = mergeLocaleJson(
    readFileSync(basePath, 'utf8'),
    readFileSync(oursPath, 'utf8'),
    readFileSync(theirsPath, 'utf8')
  )
  if (result.text !== undefined) {
    writeFileSync(oursPath, result.text)
    return 0
  }
  console.error(`[locale-json-merge] both sides changed: ${result.conflicts.join(', ')}`)
  try {
    execFileSync('git', [
      'merge-file',
      '-L',
      'ours',
      '-L',
      'base',
      '-L',
      'theirs',
      oursPath,
      basePath,
      theirsPath
    ])
  } catch {
    // merge-file exits non-zero when it leaves conflict markers, which is the point here.
  }
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runAsMergeDriver(process.argv.slice(2)))
}
