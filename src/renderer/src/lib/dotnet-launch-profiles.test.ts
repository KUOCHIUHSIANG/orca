import { describe, expect, it } from 'vitest'
import { parseDotnetLaunchProfiles } from './dotnet-launch-profiles'

describe('parseDotnetLaunchProfiles', () => {
  it('splits http and https profiles from a BOM-prefixed file', () => {
    const content = `\uFEFF{
      "profiles": {
        "http": { "commandName": "Project", "applicationUrl": "http://localhost:5016" },
        "https": {
          "commandName": "Project",
          "applicationUrl": "https://localhost:7182;http://localhost:5016"
        }
      }
    }`

    expect(parseDotnetLaunchProfiles(content)).toEqual([
      { name: 'http', applicationUrl: 'http://localhost:5016' },
      { name: 'https', applicationUrl: 'https://localhost:7182' }
    ])
  })

  it('skips profiles dotnet run cannot launch and tolerates comments', () => {
    const content = `{
      // VS-generated
      "profiles": {
        "IIS Express": { "commandName": "IISExpress" },
        "Docker": { "commandName": "Docker" },
        "bioabWebApi": { "commandName": "Project" },
      }
    }`

    expect(parseDotnetLaunchProfiles(content)).toEqual([
      { name: 'bioabWebApi', applicationUrl: null }
    ])
  })

  it('returns no profiles for malformed content', () => {
    expect(parseDotnetLaunchProfiles('not json')).toEqual([])
    expect(parseDotnetLaunchProfiles('{"profiles": []}')).toEqual([])
  })
})
