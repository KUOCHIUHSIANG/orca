import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installSyncMergeRules, mergeLocaleJson } from './locale-json-merge.mjs'

const CATALOG = 'src/renderer/src/i18n/locales/en.json'
let repo = null

function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
}

function writeCatalog(value) {
  writeFileSync(path.join(repo, CATALOG), `${JSON.stringify(value, null, 2)}\n`)
}

afterEach(() => {
  if (repo) {
    rmSync(repo, { recursive: true, force: true })
    repo = null
  }
})

describe('mergeLocaleJson', () => {
  it('keeps keys both sides added beside each other and honours one-sided deletes', () => {
    const base = { app: { a: 'A', gone: 'x' } }
    const ours = { app: { a: 'A', gone: 'x', upstream: 'U' } }
    const theirs = { app: { a: 'A', fork: 'F' } }
    expect(
      mergeLocaleJson(JSON.stringify(base), JSON.stringify(ours), JSON.stringify(theirs))
    ).toEqual({
      text: '{\n  "app": {\n    "a": "A",\n    "fork": "F",\n    "upstream": "U"\n  }\n}\n'
    })
  })

  it('reports a key both sides changed differently', () => {
    expect(mergeLocaleJson('{"a":{"b":"1"}}', '{"a":{"b":"2"}}', '{"a":{"b":"3"}}')).toEqual({
      conflicts: ['a.b']
    })
  })
})

describe('installSyncMergeRules', () => {
  it('lets a rebase through when upstream and the fork add neighbouring keys', () => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'locale-json-merge-'))
    git('init', '-q', '-b', 'main')
    git('config', 'user.name', 'test')
    git('config', 'user.email', 'test@localhost')
    git('config', 'commit.gpgsign', 'false')
    mkdirSync(path.dirname(path.join(repo, CATALOG)), { recursive: true })
    writeCatalog({ app: { a: 'A', z: 'Z' } })
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    git('switch', '-q', '-c', 'fork')
    writeCatalog({ app: { a: 'A', fork: 'F', z: 'Z' } })
    git('commit', '-q', '-am', 'fork adds a key')
    git('switch', '-q', 'main')
    writeCatalog({ app: { a: 'A', upstream: 'U', z: 'Z' } })
    git('commit', '-q', '-am', 'upstream adds a key')

    installSyncMergeRules(repo)
    git('rebase', '-q', 'main', 'fork')

    expect(JSON.parse(readFileSync(path.join(repo, CATALOG), 'utf8'))).toEqual({
      app: { a: 'A', upstream: 'U', fork: 'F', z: 'Z' }
    })
  })
})
