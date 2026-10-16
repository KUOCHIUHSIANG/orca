import { describe, expect, it } from 'vitest'
import { getLatestUpstreamReleaseLink } from './latest-upstream-release-link'

describe('getLatestUpstreamReleaseLink', () => {
  it('names the release the fork is already on', () => {
    expect(
      getLatestUpstreamReleaseLink({
        state: 'not-available',
        latestUpstreamRelease: { version: 'v1.4.226', skipped: false }
      })
    ).toEqual({
      label: 'Latest official release: v1.4.226',
      url: 'https://github.com/stablyai/orca/releases/tag/v1.4.226'
    })
  })

  it('says when the newest release was skipped', () => {
    expect(
      getLatestUpstreamReleaseLink({
        state: 'not-available',
        latestUpstreamRelease: { version: 'v1.4.227', skipped: true }
      })?.label
    ).toBe('Latest official release: v1.4.227 (hotfix of an older release, skipped)')
  })

  it('stays hidden outside fork "latest version" results', () => {
    expect(getLatestUpstreamReleaseLink({ state: 'not-available' })).toBeNull()
    expect(getLatestUpstreamReleaseLink({ state: 'checking' })).toBeNull()
  })
})
