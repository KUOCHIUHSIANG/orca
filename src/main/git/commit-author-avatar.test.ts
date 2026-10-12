import { describe, expect, it } from 'vitest'
import { parseHostedCommitUrl } from './commit-author-avatar'

const SHA = 'ca962b3ddaf948863fc478b32d79a0f87e0f82d2'

describe('parseHostedCommitUrl', () => {
  it('reads nested GitLab group paths', () => {
    expect(
      parseHostedCommitUrl(`https://gitlab.com/autron-tech-team/ecommence/-/commit/${SHA}`)
    ).toEqual({
      provider: 'gitlab',
      host: 'gitlab.com',
      repoPath: 'autron-tech-team/ecommence',
      sha: SHA
    })
  })

  it('reads GitHub owner/repo paths', () => {
    expect(parseHostedCommitUrl(`https://github.com/stablyai/orca/commit/${SHA}`)).toEqual({
      provider: 'github',
      host: 'github.com',
      repoPath: 'stablyai/orca',
      sha: SHA
    })
  })

  it('rejects other providers and non-web URLs', () => {
    expect(parseHostedCommitUrl(`https://bitbucket.org/team/repo/commits/${SHA}`)).toBeNull()
    expect(parseHostedCommitUrl(`file:///gitlab.com/a/-/commit/${SHA}`)).toBeNull()
    expect(parseHostedCommitUrl('not a url')).toBeNull()
  })
})
