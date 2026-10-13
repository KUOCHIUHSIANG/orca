import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const { buildAuthorizeUrl, createPkcePair, parseTokenResponse, MicrosoftTodoError } =
  await import('./microsoft-todo-auth')

describe('createPkcePair', () => {
  it('derives an S256 challenge from the verifier', () => {
    const { verifier, challenge } = createPkcePair()
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })
})

describe('buildAuthorizeUrl', () => {
  it('asks the consumers authority for To Do access with PKCE', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client',
        redirectUri: 'http://localhost:5000',
        state: 'state',
        challenge: 'challenge'
      })
    )
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
    )
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client',
      response_type: 'code',
      redirect_uri: 'http://localhost:5000',
      scope: 'offline_access Tasks.ReadWrite User.Read',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      state: 'state'
    })
  })
})

describe('parseTokenResponse', () => {
  it('returns tokens that expire a minute early', () => {
    expect(
      parseTokenResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, 1_000)
    ).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 1_000 + 3_600_000 - 60_000 })
  })

  it('treats a revoked refresh token as signed out', () => {
    expect(() =>
      parseTokenResponse(
        { error: 'invalid_grant', error_description: 'AADSTS70000: expired.\r\nTrace ID: x' },
        0
      )
    ).toThrow(expect.objectContaining({ kind: 'signed-out', message: 'AADSTS70000: expired.' }))
  })

  it('treats a bad app registration as not configured', () => {
    try {
      parseTokenResponse({ error: 'invalid_client', error_description: 'bad app' }, 0)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(MicrosoftTodoError)
      expect(error).toMatchObject({ kind: 'not-configured' })
    }
  })
})
