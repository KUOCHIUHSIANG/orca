import { describe, expect, it } from 'vitest'
import type { RunConfiguration } from '../../../shared/run-configuration-types'
import { groupRunConfigurationsForMenu } from './run-configuration-menu'

function config(
  id: string,
  projectPath: string,
  group?: RunConfiguration['group']
): RunConfiguration {
  return { id, type: 'npm', label: id, command: id, projectPath, isAutoDetected: true, group }
}

describe('groupRunConfigurationsForMenu', () => {
  it('folds grouped configs into one submenu at the first member position', () => {
    const api = '/repo/Api.csproj'
    const http = config('http', api, { label: 'Api', itemLabel: 'http' })
    const https = config('https', api, { label: 'Api', itemLabel: 'https' })
    const dev = config('dev', '/repo/package.json')

    expect(groupRunConfigurationsForMenu([http, dev, https])).toEqual([
      { kind: 'group', key: `${api}\0Api`, label: 'Api', configs: [http, https] },
      { kind: 'item', config: dev }
    ])
  })

  it('keeps same-named groups from different projects apart', () => {
    const shopBuild = config('shop', '/repo/shop/package.json', { label: 'build', itemLabel: 'a' })
    const adminBuild = config('admin', '/repo/admin/package.json', {
      label: 'build',
      itemLabel: 'b'
    })

    expect(groupRunConfigurationsForMenu([shopBuild, adminBuild])).toEqual([
      { kind: 'item', config: shopBuild },
      { kind: 'item', config: adminBuild }
    ])
  })
})
