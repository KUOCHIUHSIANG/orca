#!/usr/bin/env node
// Regenerates the fork's Traditional Chinese (Taiwan) catalog from upstream's zh.json:
//
//   node config/scripts/fork-maintenance/generate-zh-tw-locale.mjs [--check]
//
// zh.json → OpenCC cn→twp → Taiwan UI wording (zh-tw-locale-terms.mjs) → zh-TW.json.
// --check exits 1 when zh-TW.json is out of date instead of writing it.
// OpenCC is installed on demand under tmp/ so the fork never touches package.json or the lockfile.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { applyZhTwTerms } from './zh-tw-locale-terms.mjs'

const OPENCC_VERSION = '1.4.2'

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
const localesDir = path.join(repoRoot, 'src', 'renderer', 'src', 'i18n', 'locales')
const toolDir = path.join(repoRoot, 'tmp', 'fork-tools', 'opencc')

function installedOpenCCVersion() {
  const manifest = path.join(toolDir, 'node_modules', 'opencc-js', 'package.json')
  return existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : null
}

function loadOpenCC() {
  if (installedOpenCCVersion() !== OPENCC_VERSION) {
    mkdirSync(toolDir, { recursive: true })
    writeFileSync(path.join(toolDir, 'package.json'), '{ "private": true }\n')
    console.log(`[zh-TW] Installing opencc-js@${OPENCC_VERSION} into ${toolDir}`)
    execFileSync(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        '--no-package-lock',
        `opencc-js@${OPENCC_VERSION}`
      ],
      { cwd: toolDir, stdio: 'inherit' }
    )
  }
  return createRequire(path.join(toolDir, 'package.json'))('opencc-js')
}

function readCatalog(name) {
  return JSON.parse(readFileSync(path.join(localesDir, `${name}.json`), 'utf8'))
}

function convertCatalog(zhNode, enNode, convert) {
  const result = {}
  for (const [key, value] of Object.entries(zhNode)) {
    const enValue = enNode?.[key]
    result[key] =
      typeof value === 'string'
        ? applyZhTwTerms(convert(value), typeof enValue === 'string' ? enValue : '')
        : convertCatalog(value, enValue, convert)
  }
  return result
}

export function main(argv = process.argv.slice(2)) {
  const OpenCC = loadOpenCC()
  const convert = OpenCC.Converter({ from: 'cn', to: 'twp' })
  const catalog = convertCatalog(readCatalog('zh'), readCatalog('en'), convert)
  const text = `${JSON.stringify(catalog, null, 2)}\n`
  const target = path.join(localesDir, 'zh-TW.json')
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null
  if (current === text) {
    console.log('[zh-TW] zh-TW.json is up to date.')
    return 0
  }
  if (argv.includes('--check')) {
    console.error('[zh-TW] zh-TW.json is out of date. Run generate-zh-tw-locale.mjs.')
    return 1
  }
  writeFileSync(target, text)
  console.log('[zh-TW] Wrote zh-TW.json.')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
