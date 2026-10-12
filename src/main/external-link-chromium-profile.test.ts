import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, shell: {} }))

import { readLastUsedChromiumProfile } from './external-link-chromium-profile'

describe('readLastUsedChromiumProfile', () => {
  it('returns the profile folder Chrome recorded as last focused', () => {
    expect(readLastUsedChromiumProfile({ profile: { last_used: 'Profile 6' } })).toBe('Profile 6')
    expect(readLastUsedChromiumProfile({ profile: { last_used: 'Default' } })).toBe('Default')
  })

  it('rejects anything that is not a Chromium profile folder name', () => {
    expect(readLastUsedChromiumProfile({ profile: { last_used: '--incognito' } })).toBeNull()
    expect(readLastUsedChromiumProfile({ profile: { last_used: 'Guest Profile' } })).toBeNull()
    expect(readLastUsedChromiumProfile({ profile: {} })).toBeNull()
    expect(readLastUsedChromiumProfile(null)).toBeNull()
  })
})
