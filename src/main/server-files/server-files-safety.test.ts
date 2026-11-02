import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetSecretStoreForTests,
  setSecretStore,
  type SecretStore
} from '../../shared/secret-store'
import { loadServerPassword, saveServerPassword } from './server-files-password-store'

const moduleDir = __dirname
const productionSources = readdirSync(moduleDir)
  .filter((name) => name.endsWith('.ts') && !name.includes('.test'))
  .map((name) => ({ name, text: readFileSync(join(moduleDir, name), 'utf-8') }))

describe('the 伺服器 page never deploys or escalates on the server', () => {
  it('imports nothing that installs orcad or a relay', () => {
    const forbidden =
      /from '[^']*(ssh-connect-flow|managed-server|orcad|relay|ssh-connection-manager|ssh-host-server)[^']*'/
    for (const source of productionSources) {
      expect(forbidden.test(source.text), source.name).toBe(false)
    }
  })

  it('never changes permissions or uses sudo', () => {
    const escalation = /\.(f?chmod|f?chown|l?setstat)\(|\bsudo\b|['"`]chmod |['"`]chown /
    const copyCommand = readFileSync(
      join(moduleDir, '../../shared/server-files-copy-command.ts'),
      'utf-8'
    )
    for (const source of [...productionSources, { name: 'copy-command', text: copyCommand }]) {
      expect(escalation.test(source.text), source.name).toBe(false)
    }
  })
})

describe('saved passwords', () => {
  let home: string
  let previousHome: string | undefined

  const store = (available: boolean, gap: string | null = null): SecretStore => ({
    isEncryptionAvailable: () => available,
    describeProtectionGap: () => gap,
    encryptString: (plain) => Buffer.from(`sealed:${Buffer.from(plain).toString('base64')}`),
    decryptString: (cipher) =>
      Buffer.from(cipher.toString().replace('sealed:', ''), 'base64').toString()
  })

  beforeEach(() => {
    previousHome = process.env.HOME
    home = mkdtempSync(join(tmpdir(), 'server-files-home-'))
    process.env.HOME = home
  })

  afterEach(() => {
    process.env.HOME = previousHome
    _resetSecretStoreForTests()
    rmSync(home, { recursive: true, force: true })
  })

  it('are refused rather than written in plaintext when nothing can seal them', () => {
    setSecretStore(store(false))
    expect(() => saveServerPassword('prod', 'hunter2')).toThrow()
    setSecretStore(store(true, 'basic_text keyring'))
    expect(() => saveServerPassword('prod', 'hunter2')).toThrow()
    expect(loadServerPassword('prod')).toBeNull()
  })

  it('are stored only as ciphertext', () => {
    setSecretStore(store(true))
    saveServerPassword('prod', 'hunter2')
    const raw = readFileSync(join(home, '.orca', 'server-files-passwords', 'prod.enc'), 'utf-8')
    expect(raw).not.toContain('hunter2')
    expect(loadServerPassword('prod')).toBe('hunter2')
    saveServerPassword('prod', null)
    expect(loadServerPassword('prod')).toBeNull()
  })
})
