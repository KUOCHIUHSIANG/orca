import { beforeEach, describe, expect, it, vi } from 'vitest'
import { detectRunConfigurations } from './run-configuration-detection'

function stubFileTree(files: Record<string, string>): void {
  vi.stubGlobal('window', {
    api: {
      fs: {
        readDir: async ({ dirPath }: { dirPath: string }) => {
          const names = new Map<string, boolean>()
          for (const path of Object.keys(files)) {
            if (!path.startsWith(`${dirPath}/`)) {
              continue
            }
            const [name, ...rest] = path.slice(dirPath.length + 1).split('/')
            names.set(name, rest.length > 0)
          }
          return [...names].map(([name, isDirectory]) => ({ name, isDirectory }))
        },
        readFile: async ({ filePath }: { filePath: string }) => {
          if (!(filePath in files)) {
            throw new Error('ENOENT')
          }
          return { content: files[filePath], isBinary: false }
        }
      }
    }
  })
}

const csproj = (body = ''): string =>
  `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup>${body}</Project>`

describe('detectRunConfigurations', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('splits launch profiles into one group and skips test projects', async () => {
    stubFileTree({
      '/repo/src/Api/Api.csproj': csproj(),
      '/repo/src/Api/Properties/launchSettings.json': JSON.stringify({
        profiles: {
          http: { commandName: 'Project', applicationUrl: 'http://localhost:5016' },
          https: { commandName: 'Project', applicationUrl: 'https://localhost:7182' }
        }
      }),
      '/repo/tests/Api.Tests.Unit.csproj': csproj(
        '<ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" /></ItemGroup>'
      )
    })

    const configs = await detectRunConfigurations('/repo')

    expect(configs.map((c) => [c.label, c.group, c.command])).toEqual([
      [
        'Api: http',
        { label: 'Api (.NET 10.0)', itemLabel: 'http' },
        '$HOME/.dotnet/dotnet run --project "src/Api/Api.csproj" --launch-profile "http"'
      ],
      [
        'Api: https',
        { label: 'Api (.NET 10.0)', itemLabel: 'https' },
        '$HOME/.dotnet/dotnet run --project "src/Api/Api.csproj" --launch-profile "https"'
      ]
    ])
  })

  it('keeps only dev and build scripts, grouping build variants', async () => {
    const scripts = (names: string[]): string =>
      JSON.stringify({ scripts: Object.fromEntries(names.map((n) => [n, n])) })
    stubFileTree({
      '/repo/package.json': scripts(['dev', 'build', 'start', 'lint']),
      '/repo/admin/package.json': JSON.stringify({
        name: 'admin',
        scripts: { dev: 'vite', 'build:pro': 'b', 'build:dev': 'b', 'serve:pro': 's' }
      }),
      '/repo/legacy/package.json': JSON.stringify({
        name: 'legacy',
        scripts: { start: 'react-scripts start', test: 't' }
      })
    })

    const configs = await detectRunConfigurations('/repo')

    expect(configs.map((c) => [c.label, c.group?.label ?? null])).toEqual([
      ['dev', null],
      ['build', 'build'],
      ['admin: dev', null],
      ['admin: build:pro', 'admin: build'],
      ['admin: build:dev', 'admin: build'],
      ['legacy: start', null]
    ])
  })
})
