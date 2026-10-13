import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { shell } from 'electron'
import { getMainHttpClient } from '../network/http-client'
import {
  ORCA_CLOUD_CALLBACK_RESPONSE_HEADERS,
  ORCA_CLOUD_CALLBACK_SUCCESS_PAGE
} from '../orca-profiles/profile-cloud-callback-page'
import { asString, isRecord } from '../untrusted-json-guards'
import type { MicrosoftTodoErrorKind } from '../../shared/microsoft-todo-types'
import type { MicrosoftTokens } from './microsoft-todo-store'

// Why: "consumers" is the authority for personal Microsoft accounts (outlook.com, hotmail.com).
const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
export const MICROSOFT_TODO_SCOPES = 'offline_access Tasks.ReadWrite User.Read'
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 20_000
// Why: refresh a minute early so a request never races the access token's expiry.
const EXPIRY_SKEW_MS = 60_000

export class MicrosoftTodoError extends Error {
  readonly kind: MicrosoftTodoErrorKind

  constructor(kind: MicrosoftTodoErrorKind, message: string) {
    super(message)
    this.name = 'MicrosoftTodoError'
    this.kind = kind
  }
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32))
  return { verifier, challenge: base64Url(createHash('sha256').update(verifier).digest()) }
}

export function buildAuthorizeUrl(args: {
  clientId: string
  redirectUri: string
  state: string
  challenge: string
}): string {
  const url = new URL(`${AUTHORITY}/authorize`)
  url.searchParams.set('client_id', args.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', MICROSOFT_TODO_SCOPES)
  url.searchParams.set('state', args.state)
  url.searchParams.set('code_challenge', args.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

/** Maps an OAuth token response (success or error body) to tokens or a typed failure. */
export function parseTokenResponse(body: unknown, now: number): MicrosoftTokens {
  if (!isRecord(body)) {
    throw new MicrosoftTodoError('api', 'Microsoft returned an unexpected sign-in response.')
  }
  const error = asString(body.error)
  if (error) {
    const description = asString(body.error_description) ?? error
    // Why: invalid_grant means the refresh token expired or was revoked — only a new sign-in helps.
    const kind: MicrosoftTodoErrorKind =
      error === 'invalid_grant'
        ? 'signed-out'
        : error === 'invalid_client' || error === 'unauthorized_client'
          ? 'not-configured'
          : 'api'
    throw new MicrosoftTodoError(kind, description.split('\r\n')[0] ?? description)
  }
  const accessToken = asString(body.access_token)
  const refreshToken = asString(body.refresh_token)
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600
  if (!accessToken || !refreshToken) {
    throw new MicrosoftTodoError('api', 'Microsoft did not return a refresh token.')
  }
  return { accessToken, refreshToken, expiresAt: now + expiresIn * 1000 - EXPIRY_SKEW_MS }
}

async function requestTokens(form: Record<string, string>): Promise<MicrosoftTokens> {
  let response: Response
  try {
    response = await getMainHttpClient().fetch(`${AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    throw new MicrosoftTodoError('network', error instanceof Error ? error.message : String(error))
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Non-JSON bodies are reported by parseTokenResponse.
  }
  return parseTokenResponse(body, Date.now())
}

export function refreshMicrosoftTokens(
  clientId: string,
  refreshToken: string
): Promise<MicrosoftTokens> {
  return requestTokens({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MICROSOFT_TODO_SCOPES
  })
}

function closeServer(server: Server): void {
  try {
    server.closeAllConnections?.()
    server.close()
  } catch {
    // Already closed.
  }
}

/** Waits for the loopback redirect and returns the authorization code it carried. */
function waitForAuthorizationCode(
  clientId: string,
  challenge: string,
  state: string
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    let redirectUri = ''
    const finish = (error: Error | null, code?: string): void => {
      if (settled) {
        return
      }
      settled = true
      closeServer(server)
      closeServer(serverV6)
      if (error || !code) {
        reject(error ?? new MicrosoftTodoError('api', 'Microsoft sign-in did not return a code.'))
      } else {
        resolve({ code, redirectUri })
      }
    }
    const handle = (request: IncomingMessage, response: ServerResponse): void => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname !== '/' || url.searchParams.get('state') !== state) {
        // Why: stray loopback probes must not be able to cancel the user's sign-in.
        response.writeHead(404)
        response.end('Not found')
        return
      }
      const error = url.searchParams.get('error')
      if (error) {
        response.writeHead(400)
        response.end('Microsoft sign-in was not completed. Return to Orca and try again.')
        const description = url.searchParams.get('error_description') ?? error
        finish(
          new MicrosoftTodoError(
            error === 'access_denied' ? 'cancelled' : 'not-configured',
            description
          )
        )
        return
      }
      response.writeHead(200, ORCA_CLOUD_CALLBACK_RESPONSE_HEADERS)
      response.end(ORCA_CLOUD_CALLBACK_SUCCESS_PAGE)
      finish(null, url.searchParams.get('code') ?? undefined)
    }
    const server = createServer(handle)
    // Why: browsers may resolve localhost to ::1 first; a second listener on the same port covers it.
    const serverV6 = createServer(handle)
    const timeout = setTimeout(
      () => finish(new MicrosoftTodoError('cancelled', 'Microsoft sign-in timed out.')),
      SIGN_IN_TIMEOUT_MS
    )
    server.once('close', () => clearTimeout(timeout))
    server.once('error', (error) => finish(error))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        finish(new MicrosoftTodoError('api', 'Could not open a local sign-in port.'))
        return
      }
      // Why: Entra matches an http://localhost registration on any port for desktop apps.
      redirectUri = `http://localhost:${address.port}`
      serverV6.once('error', () => closeServer(serverV6))
      serverV6.listen(address.port, '::1')
      void shell
        .openExternal(buildAuthorizeUrl({ clientId, redirectUri, state, challenge }))
        .catch((error: unknown) =>
          finish(error instanceof Error ? error : new Error(String(error)))
        )
    })
  })
}

/** Runs the browser sign-in (auth code + PKCE over a loopback redirect) and returns tokens. */
export async function signInWithMicrosoft(clientId: string): Promise<MicrosoftTokens> {
  const { verifier, challenge } = createPkcePair()
  const state = base64Url(randomBytes(24))
  const { code, redirectUri } = await waitForAuthorizationCode(clientId, challenge, state)
  return requestTokens({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    scope: MICROSOFT_TODO_SCOPES
  })
}
