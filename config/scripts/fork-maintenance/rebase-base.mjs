// Decides where a fork sync's rebase starts, so only the fork's own commits move to the new tag.
import { execFileSync, spawnSync } from 'node:child_process'

/**
 * Why not `git describe`: custom can branch off upstream main past its newest tag, and rebasing
 * from that tag would replay upstream commits the target already contains (hundreds of conflicts).
 * The merge-base with the target is where the fork's own commits begin.
 */
export function resolveRebaseBase({ cwd, branch, targetTag, upstreamMain }) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const target = git('rev-parse', `${targetTag}^{commit}`)
  const forkPoint = git('merge-base', branch, upstreamMain)
  // A tag cut before the fork point would roll back upstream commits custom already builds on.
  const contains = spawnSync('git', ['merge-base', '--is-ancestor', forkPoint, target], { cwd })
  if (contains.status !== 0) {
    return { kind: 'target-predates-fork', forkPoint }
  }
  const base = git('merge-base', branch, target)
  return { kind: base === target ? 'already-based' : 'rebase', base }
}
