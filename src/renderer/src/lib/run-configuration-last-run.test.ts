import { beforeEach, describe, expect, it } from 'vitest'
import type { RunConfiguration } from '../../../shared/run-configuration-types'
import {
  rememberRunConfigurationLaunch,
  useRunConfigurationLastRun
} from './run-configuration-last-run'

function config(id: string, type: RunConfiguration['type']): RunConfiguration {
  return { id, type, label: id, command: id, projectPath: '/repo/x', isAutoDetected: true }
}

describe('rememberRunConfigurationLaunch', () => {
  beforeEach(() => {
    useRunConfigurationLastRun.setState({ lastDotnetByRepo: {} })
  })

  it('remembers the last .NET launch per repo and ignores npm scripts', () => {
    rememberRunConfigurationLaunch('repo-a::/wt/one', config('api-https', 'dotnet'))
    rememberRunConfigurationLaunch('repo-a::/wt/two', config('dev', 'npm'))
    rememberRunConfigurationLaunch('repo-b::/wt', config('web-http', 'dotnet'))
    expect(useRunConfigurationLastRun.getState().lastDotnetByRepo).toEqual({
      'repo-a': 'api-https',
      'repo-b': 'web-http'
    })
  })
})
