import { beforeEach, describe, expect, it } from 'vitest'
import type { RunConfiguration } from '../../../shared/run-configuration-types'
import {
  applyRunConfigurationVisibility,
  partitionRunConfigurations,
  useRunConfigurationVisibility
} from './run-configuration-visibility'

function config(id: string, defaultHidden?: boolean): RunConfiguration {
  return {
    id,
    type: 'npm',
    label: id,
    command: id,
    projectPath: '/repo/package.json',
    isAutoDetected: true,
    defaultHidden
  }
}

const dev = config('dev')
const lint = config('lint', true)

describe('partitionRunConfigurations', () => {
  it('follows the detected default until the user overrides it', () => {
    expect(partitionRunConfigurations([dev, lint], undefined)).toEqual({
      visible: [dev],
      hidden: [lint]
    })
    expect(partitionRunConfigurations([dev, lint], { dev: true, lint: false })).toEqual({
      visible: [lint],
      hidden: [dev]
    })
  })
})

describe('applyRunConfigurationVisibility', () => {
  it('stores only choices that differ from the default', () => {
    const hidden = applyRunConfigurationVisibility(undefined, [dev, lint], true)
    expect(hidden).toEqual({ dev: true })
    expect(applyRunConfigurationVisibility(hidden, [dev, lint], false)).toEqual({ lint: false })
  })
})

describe('useRunConfigurationVisibility', () => {
  beforeEach(() => {
    useRunConfigurationVisibility.setState({ overridesByRepo: {} })
  })

  it('keeps choices per repo and drops a repo once it is back to defaults', () => {
    const { setHidden } = useRunConfigurationVisibility.getState()
    setHidden('repo-a', [dev], true)
    setHidden('repo-b', [lint], false)
    expect(useRunConfigurationVisibility.getState().overridesByRepo).toEqual({
      'repo-a': { dev: true },
      'repo-b': { lint: false }
    })

    setHidden('repo-a', [dev], false)
    expect(useRunConfigurationVisibility.getState().overridesByRepo).toEqual({
      'repo-b': { lint: false }
    })
  })
})
