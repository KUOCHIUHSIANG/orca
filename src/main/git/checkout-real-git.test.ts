import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkoutBranch, createBranch } from './checkout'
import { gitExecFileAsync } from './runner'

const COMMIT = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm']

let root = ''
let repo = ''

async function git(args: string[], cwd = repo): Promise<string> {
  return (await gitExecFileAsync(args, { cwd })).stdout.trim()
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-branch-switch-'))
  repo = join(root, 'repo')
  await git(['init', '--quiet', '--bare', join(root, 'origin.git')], root)
  await git(['init', '--quiet', repo], root)
  await git(['symbolic-ref', 'HEAD', 'refs/heads/main'])
  await writeFile(join(repo, 'f.txt'), 'main\n')
  await git(['add', '.'])
  await git([...COMMIT, 'main'])
  await git(['remote', 'add', 'origin', join(root, 'origin.git')])
  await git(['push', '-q', 'origin', 'main', 'main:feature'])
  await git(['fetch', '-q', 'origin'])
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('branch switching against real git', () => {
  it('checks out a remote-only branch as a local branch tracking it', async () => {
    await checkoutBranch(repo, 'feature')

    expect(await git(['symbolic-ref', '--short', 'HEAD'])).toBe('feature')
    expect(await git(['rev-parse', '--abbrev-ref', 'feature@{u}'])).toBe('origin/feature')
  })

  it('names the conflicting files when local changes would be overwritten', async () => {
    await createBranch(repo, 'other')
    await writeFile(join(repo, 'f.txt'), 'other\n')
    await git([...COMMIT, 'other', '-a'])
    await writeFile(join(repo, 'f.txt'), 'dirty\n')

    await expect(checkoutBranch(repo, 'main')).rejects.toThrow(
      "Switching to 'main' would overwrite local changes: f.txt. Commit or stash them first."
    )
  })

  it('creates a branch at HEAD, switches to it, and rejects a duplicate name', async () => {
    const head = await git(['rev-parse', 'HEAD'])
    await createBranch(repo, 'topic')

    expect(await git(['symbolic-ref', '--short', 'HEAD'])).toBe('topic')
    expect(await git(['rev-parse', 'HEAD'])).toBe(head)
    await expect(createBranch(repo, 'main')).rejects.toThrow(
      "A branch named 'main' already exists."
    )
  })
})
