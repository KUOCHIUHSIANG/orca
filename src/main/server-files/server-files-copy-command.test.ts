import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildServerCopyCommand, withStableLocale } from '../../shared/server-files-copy-command'
import { wrapRemoteCommandForPosixShell } from '../ssh/ssh-posix-command-wrapper'

// Names a project or backup folder could plausibly (or maliciously) carry.
const HOSTILE_NAMES = [
  'My App',
  "it's",
  'say "hi"',
  '$(touch pwned)',
  '`touch pwned`',
  '; touch pwned',
  'a && touch pwned',
  'a | touch pwned',
  'line\nbreak',
  '*',
  '-rf',
  '--',
  'back\\slash',
  '中文 資料夾',
  'emoji 🚀',
  '$HOME',
  "'; touch pwned; '"
]

let sandbox: string

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'server-files-copy-'))
  const stub = (name: string): void => {
    const path = join(sandbox, name)
    // Records the exact argv, NUL-separated, instead of touching the disk.
    writeFileSync(
      path,
      `#!/bin/sh\nfor a in "$@"; do printf '%s\\0' "$a"; done > "$RECORD/${name}.args"\n`
    )
    chmodSync(path, 0o755)
  }
  stub('cp')
  stub('mkdir')
})

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

function runThroughShell(shell: string, script: string): Record<'cp' | 'mkdir', string[]> {
  for (const name of ['cp', 'mkdir']) {
    rmSync(join(sandbox, `${name}.args`), { force: true })
  }
  const result = spawnSync(shell, ['-c', script], {
    cwd: sandbox,
    env: { PATH: `${sandbox}:/usr/bin:/bin`, RECORD: sandbox, HOME: sandbox },
    encoding: 'utf-8'
  })
  expect(result.status, result.stderr).toBe(0)
  const read = (name: string): string[] =>
    readFileSync(join(sandbox, `${name}.args`), 'utf-8')
      .split('\0')
      .slice(0, -1)
  return { cp: read('cp'), mkdir: read('mkdir') }
}

const shells = ['/bin/sh', '/bin/bash', '/bin/zsh'].filter((shell) => existsSync(shell))

describe.skipIf(process.platform === 'win32')('buildServerCopyCommand quoting', () => {
  for (const name of HOSTILE_NAMES) {
    it(`passes ${JSON.stringify(name)} through as exact arguments`, () => {
      const file = buildServerCopyCommand({
        source: `/srv/site/${name}`,
        destination: `/home/me/project/${name}`,
        kind: 'file'
      })
      const folder = buildServerCopyCommand({
        source: `/srv/${name}`,
        destination: `/home/me/${name}`,
        kind: 'directory'
      })
      for (const shell of shells) {
        // Directly, and through the wrapper that hands remote commands to /bin/sh.
        for (const script of [
          withStableLocale(file),
          wrapRemoteCommandForPosixShell(withStableLocale(file))
        ]) {
          expect(runThroughShell(shell, script)).toEqual({
            mkdir: ['-p', '--', '/home/me/project'],
            cp: ['-a', '--', `/srv/site/${name}`, `/home/me/project/${name}`]
          })
        }
        expect(runThroughShell(shell, withStableLocale(folder))).toEqual({
          mkdir: ['-p', '--', `/home/me/${name}`],
          cp: ['-a', '--', `/srv/${name}/.`, `/home/me/${name}`]
        })
      }
      expect(existsSync(join(sandbox, 'pwned'))).toBe(false)
    })
  }
})
