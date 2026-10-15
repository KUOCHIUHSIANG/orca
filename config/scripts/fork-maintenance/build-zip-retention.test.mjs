import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pruneOldBuildZips } from './build-zip-retention.mjs'

let dist = ''

function build(name, ageDays) {
  const zip = path.join(dist, `Orca-${name}-arm64-mac.zip`)
  writeFileSync(zip, 'zip')
  writeFileSync(`${zip}.blockmap`, 'map')
  const time = new Date(Date.now() - ageDays * 86_400_000)
  utimesSync(zip, time, time)
}

beforeEach(() => {
  dist = mkdtempSync(path.join(os.tmpdir(), 'zip-retention-'))
})

afterEach(() => {
  rmSync(dist, { recursive: true, force: true })
})

describe('pruneOldBuildZips', () => {
  it('keeps the current and previous build, removing older zips with their blockmaps', () => {
    build('v1', 3)
    build('v2', 2)
    build('v3', 1)
    writeFileSync(path.join(dist, 'latest-mac.yml'), 'yml')
    expect(pruneOldBuildZips(dist)).toEqual(['Orca-v1-arm64-mac.zip'])
    expect(readdirSync(dist).sort()).toEqual([
      'Orca-v2-arm64-mac.zip',
      'Orca-v2-arm64-mac.zip.blockmap',
      'Orca-v3-arm64-mac.zip',
      'Orca-v3-arm64-mac.zip.blockmap',
      'latest-mac.yml'
    ])
  })

  it('leaves a missing dist folder and a short history alone', () => {
    expect(pruneOldBuildZips(path.join(dist, 'missing'))).toEqual([])
    build('only', 1)
    expect(pruneOldBuildZips(dist)).toEqual([])
    expect(existsSync(path.join(dist, 'Orca-only-arm64-mac.zip'))).toBe(true)
  })
})
