// Decides where a fork sync's rebase starts, so only the fork's own commits move to the new tag.
import { execFileSync, spawnSync } from 'node:child_process'

/**
 * Why not `git describe`: custom can branch off upstream main past its newest tag, and rebasing
 * from that tag would replay upstream commits the target already contains (hundreds of conflicts).
 * Why not only the merge-base with the target: a release tag sits on its own release branch
 * (version bump, workflow sync, cherry-picks), so that merge-base falls back to main and would
 * replay the old release branch's commits onto the new one.
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
  const mergeBase = git('merge-base', branch, target)
  if (mergeBase === target) {
    return { kind: 'already-based', base: target }
  }
  // The newest upstream commit custom builds on: where history stops being reachable from upstream.
  const boundary = git('rev-list', '--boundary', branch, '--not', upstreamMain, '--tags=v[0-9]*')
    .split('\n')
    .filter((line) => line.startsWith('-'))
    .map((line) => line.slice(1))
  return { kind: 'rebase', base: boundary.length === 1 ? boundary[0] : mergeBase }
}
