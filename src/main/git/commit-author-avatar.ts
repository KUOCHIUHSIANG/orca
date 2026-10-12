import { ghExecFileAsync, glabExecFileAsync } from './runner'

type HostedCommit = { provider: 'github' | 'gitlab'; host: string; repoPath: string; sha: string }

const GITLAB_COMMIT_AUTHOR_QUERY =
  'query($fullPath: ID!, $ref: String!) { project(fullPath: $fullPath) { repository { tree(ref: $ref) { lastCommit { author { avatarUrl } } } } } }'
const PUBLIC_AVATAR_TIMEOUT_MS = 5000
// Why per host + email: an author keeps one avatar across commits, so look each one up once a session.
const avatarByAuthor = new Map<string, Promise<string | null>>()

/** Splits a provider commit page URL (as built by buildHostedRemoteCommitUrl) into its parts. */
export function parseHostedCommitUrl(commitUrl: string): HostedCommit | null {
  let url: URL
  try {
    url = new URL(commitUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }
  const gitlab = /^\/(.+)\/-\/commit\/([0-9a-f]{40,64})$/.exec(url.pathname)
  if (gitlab) {
    return { provider: 'gitlab', host: url.host, repoPath: gitlab[1], sha: gitlab[2] }
  }
  const github = /^\/([^/]+\/[^/]+)\/commit\/([0-9a-f]{40,64})$/.exec(url.pathname)
  if (github) {
    return { provider: 'github', host: url.host, repoPath: github[1], sha: github[2] }
  }
  return null
}

function absoluteAvatarUrl(host: string, value: unknown): string | null {
  if (typeof value !== 'string' || !value) {
    return null
  }
  // Why: GitLab reports uploaded avatars as instance-relative paths.
  return value.startsWith('/') ? `https://${host}${value}` : value
}

async function lookupGitHubAvatar(commit: HostedCommit): Promise<string | null> {
  const { stdout } = await ghExecFileAsync(
    ['api', `repos/${commit.repoPath}/commits/${commit.sha}`, '--jq', '.author.avatar_url // ""'],
    { host: commit.host }
  )
  return absoluteAvatarUrl(commit.host, stdout.trim())
}

async function lookupGitLabAvatar(commit: HostedCommit, email: string): Promise<string | null> {
  // Why GraphQL first: GitLab matches the commit to its author by any verified email,
  // while the public /avatar endpoint only knows emails users chose to make public.
  try {
    const { stdout } = await glabExecFileAsync([
      'api',
      'graphql',
      '--hostname',
      commit.host,
      '-f',
      `query=${GITLAB_COMMIT_AUTHOR_QUERY}`,
      '-f',
      `fullPath=${commit.repoPath}`,
      '-f',
      `ref=${commit.sha}`
    ])
    const parsed: unknown = JSON.parse(stdout)
    const avatar = readPath(parsed, [
      'data',
      'project',
      'repository',
      'tree',
      'lastCommit',
      'author',
      'avatarUrl'
    ])
    const url = absoluteAvatarUrl(commit.host, avatar)
    if (url) {
      return url
    }
  } catch {
    // glab missing or signed out; the public endpoint still covers public emails and Gravatar.
  }
  const response = await fetch(
    `https://${commit.host}/api/v4/avatar?email=${encodeURIComponent(email)}&size=64`,
    { signal: AbortSignal.timeout(PUBLIC_AVATAR_TIMEOUT_MS) }
  )
  if (!response.ok) {
    return null
  }
  const body: unknown = await response.json()
  return absoluteAvatarUrl(commit.host, readPath(body, ['avatar_url']))
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return undefined
    }
    current = Reflect.get(current, key)
  }
  return current
}

/** Avatar for a commit's author on the repo's hosting provider, or null when none is known. */
export function resolveCommitAuthorAvatar(
  commitUrl: string,
  email: string
): Promise<string | null> {
  const commit = parseHostedCommitUrl(commitUrl)
  const normalizedEmail = email.trim().toLowerCase()
  if (!commit || !normalizedEmail) {
    return Promise.resolve(null)
  }
  const key = `${commit.provider}\0${commit.host}\0${normalizedEmail}`
  const existing = avatarByAuthor.get(key)
  if (existing) {
    return existing
  }
  const pending = (
    commit.provider === 'github'
      ? lookupGitHubAvatar(commit)
      : lookupGitLabAvatar(commit, normalizedEmail)
  ).catch(() => null)
  avatarByAuthor.set(key, pending)
  return pending
}
