import { fetchNewerReleaseTagsWithReadiness } from './updater-prerelease-feed'

/**
 * Newest official upstream release (published, not a prerelease), or null when the feed is unreadable.
 * Why not git tags: a pulled release keeps its tag (v1.4.225 and v1.4.226 were withdrawn for
 * v1.4.227), and the fork follows only what upstream currently ships.
 */
export async function fetchLatestOfficialRelease(): Promise<string | null> {
  const result = await fetchNewerReleaseTagsWithReadiness('0.0.0', 1, { includePrerelease: false })
  if (result.state === 'ready') {
    return result.tags[0] ?? null
  }
  // The newest release is still uploading its installers; the one before it is still official.
  return result.state === 'not-ready' ? (result.lastGoodTag ?? null) : null
}
