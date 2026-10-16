import type { UpdateStatus } from '../../../../../shared/update-status-types'
import { getReleaseNotesUrlForVersion } from '../../../../../shared/release-channel'
import { translate } from '@/i18n/i18n'

/** Fork builds: names the official release beside "latest version" and links its notes. */
export function getLatestUpstreamReleaseLink(
  status: UpdateStatus
): { label: string; url: string } | null {
  if (status.state !== 'not-available' || !status.latestUpstreamVersion) {
    return null
  }
  const version = status.latestUpstreamVersion
  return {
    label: translate(
      'auto.components.forkUpdate.latestRelease',
      'Latest official release: {{value0}}',
      { value0: version }
    ),
    url: getReleaseNotesUrlForVersion(version)
  }
}
