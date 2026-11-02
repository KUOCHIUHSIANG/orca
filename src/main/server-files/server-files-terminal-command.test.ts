import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ServerProfile } from '../../shared/server-files-types'
import {
  buildServerTerminalCommand,
  remoteTerminalScript,
  RUN_CONFIRMED_LINE,
  sshDestinationArgs
} from './server-files-terminal-command'

const profile: ServerProfile = {
  id: 'prod',
  label: 'prod',
  endpoint: { kind: 'ssh-config', alias: 'prod-api' },
  auth: 'auto',
  identityFile: '',
  startPath: '',
  downloadDir: '',
  protectedPaths: [],
  projects: [],
  commandTemplates: []
}

let sandbox: string

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'server-files-terminal-'))
  const ssh = join(sandbox, 'ssh')
  writeFileSync(
    ssh,
    `#!/bin/sh\nfor a in "$@"; do printf '%s\\0' "$a"; done > "$RECORD/ssh.args"\n`
  )
  chmodSync(ssh, 0o755)
  // Stands in for the login shell: records where it was started.
  const login = join(sandbox, 'login-shell')
  writeFileSync(login, `#!/bin/sh\npwd > "$RECORD/pwd"\n`)
  chmodSync(login, 0o755)
})

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

const env = () => ({
  PATH: `${sandbox}:/usr/bin:/bin`,
  RECORD: sandbox,
  HOME: sandbox,
  SHELL: join(sandbox, 'login-shell')
})

describe('sshDestinationArgs', () => {
  it('ends options before the destination so it never reads as one', () => {
    expect(sshDestinationArgs(profile)).toEqual(['-t', '--', 'prod-api'])
    expect(
      sshDestinationArgs({
        ...profile,
        auth: 'key',
        identityFile: '~/.ssh/deploy key',
        endpoint: { kind: 'manual', host: '10.0.0.5', port: 2222, username: 'deploy' }
      })
    ).toEqual(['-t', '-i', '~/.ssh/deploy key', '-p', '2222', '-l', 'deploy', '--', '10.0.0.5'])
  })
})

describe.skipIf(process.platform === 'win32')('buildServerTerminalCommand', () => {
  const folders = ['My App', "it's", '$(touch pwned)', 'semi; colon', 'back\\slash', '中文']

  for (const name of folders) {
    it(`opens the shell in ${JSON.stringify(name)}`, () => {
      const folder = join(sandbox, 'remote', name)
      mkdirSync(folder, { recursive: true })
      const command = buildServerTerminalCommand({
        profile,
        cwd: folder,
        loginShell: 'bash',
        localShell: 'posix'
      })
      for (const localShell of ['/bin/sh', '/bin/zsh'].filter((shell) => existsSync(shell))) {
        expect(spawnSync(localShell, ['-c', command], { cwd: sandbox, env: env() }).status).toBe(0)
        const argv = readFileSync(join(sandbox, 'ssh.args'), 'utf-8').split('\0').slice(0, -1)
        expect(argv.slice(0, 3)).toEqual(['-t', '--', 'prod-api'])
        // What sshd hands the login shell: run it as `$SHELL -c`.
        const remote = spawnSync('/bin/sh', ['-c', argv[3]], { cwd: sandbox, env: env() })
        expect(remote.status, remote.stderr.toString()).toBe(0)
        expect(readFileSync(join(sandbox, 'pwd'), 'utf-8').trim()).toBe(folder)
      }
      expect(existsSync(join(sandbox, 'pwned'))).toBe(false)
    })
  }

  it('keeps double quotes out of the remote script for Windows PowerShell 5.1', () => {
    expect(remoteTerminalScript('/srv/app')).not.toContain('"')
    expect(
      remoteTerminalScript('/srv/app', { command: 'sudo systemctl restart x', hint: 'Enter' })
    ).not.toContain('"')
  })
})

function bashMajorVersion(): number {
  const result = spawnSync('bash', ['-c', 'echo ${BASH_VERSINFO}'], { encoding: 'utf-8' })
  return Number(result.stdout.trim()) || 0
}

// macOS ships bash 3.2, which lacks `read -i`; servers and CI have bash 4+.
describe.skipIf(process.platform === 'win32' || bashMajorVersion() < 4)('prefilled line', () => {
  it('runs exactly the line the user confirmed, quotes and spaces intact', () => {
    const out = join(sandbox, 'out.txt')
    const typed = `printf '%s|' "a  b" '$(nope)' * > ${out}`
    const script = remoteTerminalScript(sandbox, { command: typed, hint: 'Press Enter' })
    // Without a terminal, `read -e` reads the line from stdin, as if Enter was pressed on it.
    const result = spawnSync('/bin/sh', ['-c', script], {
      cwd: sandbox,
      env: env(),
      input: `${typed}\n`
    })
    expect(result.status, result.stderr.toString()).toBe(0)
    const written = readFileSync(out, 'utf-8')
    expect(written.startsWith('a  b|$(nope)|')).toBe(true)
    // The unquoted `*` still globs, as it would at a normal prompt.
    expect(written).toContain('ssh|')
  })
})

describe.skipIf(process.platform === 'win32')('running the confirmed line', () => {
  it('re-parses the line exactly once, as a prompt would', () => {
    writeFileSync(join(sandbox, 'glob-me'), '')
    const line = `printf '%s|' "a  b" '$(nope)' glob-*`
    for (const shell of ['/bin/bash', '/bin/sh'].filter((candidate) => existsSync(candidate))) {
      const result = spawnSync(shell, ['-c', RUN_CONFIRMED_LINE], {
        cwd: sandbox,
        env: { ...env(), line },
        encoding: 'utf-8'
      })
      expect(result.stdout).toBe('a  b|$(nope)|glob-me|')
    }
  })
})
