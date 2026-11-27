// Finds directories a sync's rebase emptied of tracked files but left on disk.
import { execFileSync } from 'node:child_process'

/**
 * Untracked directories that had tracked files at `previousHead`.
 * Why: git removes a dropped module's tracked files but keeps its ignored build output; once the
 * new base's .gitignore stops covering it, it shows as untracked and blocks the next sync.
 */
export function findLeftoverDirectories({ cwd, previousHead }) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  return git('status', '--porcelain', '--untracked-files=normal')
    .split('\n')
    .filter((line) => line.startsWith('?? ') && line.endsWith('/'))
    .map((line) => line.slice(3, -1))
    .filter((dir) => git('ls-tree', '-r', '--name-only', previousHead, '--', dir).trim() !== '')
}
