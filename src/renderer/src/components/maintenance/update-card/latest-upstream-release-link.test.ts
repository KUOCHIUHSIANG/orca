import { describe, expect, it } from 'vitest'
import { getLatestUpstreamReleaseLink } from './latest-upstream-release-link'

describe('getLatestUpstreamReleaseLink', () => {
  it('names the official release the fork is on', () => {
    expect(
      getLatestUpstreamReleaseLink({ state: 'not-available', latestUpstreamVersion: 'v1.4.227' })
    ).toEqual({
      label: 'Latest official release: v1.4.227',
      url: 'https://github.com/stablyai/orca/releases/tag/v1.4.227'
    })
  })

  it('stays hidden outside fork "latest version" results', () => {
    expect(getLatestUpstreamReleaseLink({ state: 'not-available' })).toBeNull()
    expect(getLatestUpstreamReleaseLink({ state: 'checking' })).toBeNull()
  })
})
