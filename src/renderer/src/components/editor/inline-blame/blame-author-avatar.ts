const GITHUB_NOREPLY_EMAIL = /^(?:\d+\+)?([^@\s]+)@users\.noreply\.github\.com$/i

const avatarByAuthor = new Map<string, Promise<string | null>>()

/** GitHub's private-email alias spells out the account login, so no lookup is needed. */
export function githubNoreplyLogin(email: string): string | null {
  return GITHUB_NOREPLY_EMAIL.exec(email.trim())?.[1] ?? null
}

function urlHost(url: string | null): string {
  try {
    return url ? new URL(url).host : ''
  } catch {
    return ''
  }
}

async function gravatarUrl(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
  // Why d=404: a missing Gravatar should fail the <img> so the initials placeholder shows.
  return `https://www.gravatar.com/avatar/${hash.join('')}?s=64&d=404`
}

/**
 * Avatar for a commit author: the hosting provider's (via this machine's gh/glab sign-in),
 * then Gravatar. Null only when the email is empty; a broken image falls back to initials.
 */
export function loadBlameAuthorAvatar(
  email: string,
  remoteCommitUrl: string | null
): Promise<string | null> {
  const trimmed = email.trim()
  if (!trimmed) {
    return Promise.resolve(null)
  }
  const login = githubNoreplyLogin(trimmed)
  if (login) {
    return Promise.resolve(`https://github.com/${encodeURIComponent(login)}.png?size=64`)
  }
  const key = `${urlHost(remoteCommitUrl)}\0${trimmed.toLowerCase()}`
  const existing = avatarByAuthor.get(key)
  if (existing) {
    return existing
  }
  const pending = (async () => {
    const hosted = remoteCommitUrl
      ? await window.api.git
          .commitAuthorAvatar({ commitUrl: remoteCommitUrl, email: trimmed })
          .catch(() => null)
      : null
    return hosted ?? (await gravatarUrl(trimmed))
  })()
  avatarByAuthor.set(key, pending)
  return pending
}
