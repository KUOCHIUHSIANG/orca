import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchNewerReleaseTagsWithReadiness } = vi.hoisted(() => ({
  fetchNewerReleaseTagsWithReadiness: vi.fn()
}))
vi.mock('./updater-prerelease-feed', () => ({ fetchNewerReleaseTagsWithReadiness }))

const { fetchLatestOfficialRelease } = await import('./fork-official-release')

beforeEach(() => {
  fetchNewerReleaseTagsWithReadiness.mockReset()
})

describe('fetchLatestOfficialRelease', () => {
  it('asks for the newest stable release regardless of the running version', async () => {
    fetchNewerReleaseTagsWithReadiness.mockResolvedValue({ state: 'ready', tags: ['v1.4.227'] })
    expect(await fetchLatestOfficialRelease()).toBe('v1.4.227')
    expect(fetchNewerReleaseTagsWithReadiness).toHaveBeenCalledWith('0.0.0', 1, {
      includePrerelease: false
    })
  })

  it('keeps the previous release while the newest is still uploading', async () => {
    fetchNewerReleaseTagsWithReadiness.mockResolvedValue({
      state: 'not-ready',
      tags: [],
      lastGoodTag: 'v1.4.224'
    })
    expect(await fetchLatestOfficialRelease()).toBe('v1.4.224')
  })

  it('returns null when the feed cannot be read', async () => {
    fetchNewerReleaseTagsWithReadiness.mockResolvedValue({
      state: 'unavailable',
      tags: [],
      unavailableReason: 'feed'
    })
    expect(await fetchLatestOfficialRelease()).toBeNull()
  })
})
