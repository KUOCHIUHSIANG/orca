import { runProcess } from '@orca/process-host'

type SyncTargetSource = {
  repoRoot: string
  branch: string
  upstreamRemote: string
}

const TAG_FETCH_TIMEOUT_MS = 60_000
const NOT_ANCESTOR_EXIT_CODE = 1

/**
 * The newest of `tags` (newest first) that the fork branch can be re-stacked onto.
 * Why: upstream sometimes cuts a hotfix from an older release (v1.4.227 from v1.4.224); syncing to
 * it would roll back upstream commits the branch already builds on, so sync-upstream.mjs refuses it.
 */
export async function findSyncableUpstreamTag(
  fork: SyncTargetSource,
  tags: readonly string[]
): Promise<string | null> {
  const git = (args: string[], timeoutMs?: number) =>
    runProcess({ program: 'git', args, cwd: fork.repoRoot, timeoutMs })

  const forkPoint = await git(['merge-base', fork.branch, `${fork.upstreamRemote}/main`])
  if (forkPoint.code !== 0) {
    // Can't tell; the sync script runs the same check and explains a refusal.
    return tags[0] ?? null
  }

  const missing: string[] = []
  for (const tag of tags) {
    if ((await git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`])).code !== 0) {
      missing.push(tag)
    }
  }
  if (missing.length > 0) {
    await git(
      [
        'fetch',
        '--no-tags',
        fork.upstreamRemote,
        ...missing.map((t) => `+refs/tags/${t}:refs/tags/${t}`)
      ],
      TAG_FETCH_TIMEOUT_MS
    )
  }

  for (const tag of tags) {
    const result = await git([
      'merge-base',
      '--is-ancestor',
      forkPoint.stdout.trim(),
      `refs/tags/${tag}^{commit}`
    ])
    // Any other failure (e.g. the tag fetch failed) is unverifiable, not a rollback.
    if (result.code !== NOT_ANCESTOR_EXIT_CODE) {
      return tag
    }
  }
  return null
}
