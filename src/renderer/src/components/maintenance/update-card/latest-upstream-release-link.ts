import type { UpdateStatus } from '../../../../../shared/update-status-types'
import { getReleaseNotesUrlForVersion } from '../../../../../shared/release-channel'
import { translate } from '@/i18n/i18n'

/** Fork builds: names the newest official release beside "latest version", even one it skipped. */
export function getLatestUpstreamReleaseLink(
  status: UpdateStatus
): { label: string; url: string } | null {
  if (status.state !== 'not-available' || !status.latestUpstreamRelease) {
    return null
  }
  const { version, skipped } = status.latestUpstreamRelease
  return {
    label: skipped
      ? translate(
          'auto.components.forkUpdate.latestReleaseSkipped',
          'Latest official release: {{value0}} (hotfix of an older release, skipped)',
          { value0: version }
        )
      : translate(
          'auto.components.forkUpdate.latestRelease',
          'Latest official release: {{value0}}',
          {
            value0: version
          }
        ),
    url: getReleaseNotesUrlForVersion(version)
  }
}
