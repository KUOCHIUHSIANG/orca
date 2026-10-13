import { getMainHttpClient } from '../network/http-client'
import type { MondayErrorKind } from '../../shared/monday-calendar-types'
import { isRecord } from './monday-json-guards'

const MONDAY_API_URL = 'https://api.monday.com/v2'
const REQUEST_TIMEOUT_MS = 30_000

export class MondayApiError extends Error {
  readonly kind: MondayErrorKind

  constructor(kind: MondayErrorKind, message: string) {
    super(message)
    this.name = 'MondayApiError'
    this.kind = kind
  }
}

export type MondayQueryRunner = (
  query: string,
  variables: Record<string, unknown>
) => Promise<Record<string, unknown>>

/** The calendar is view-only by contract: anything other than a query is refused before it leaves the process. */
export function assertReadOnlyMondayQuery(query: string): void {
  if (!/^\s*query\b/.test(query)) {
    throw new MondayApiError('api', 'Only read-only monday.com queries are allowed.')
  }
}

function classifyGraphqlErrors(errors: unknown[]): MondayApiError {
  const first = errors.find(isRecord)
  const message = typeof first?.message === 'string' ? first.message : 'monday.com request failed.'
  const extensions = isRecord(first?.extensions) ? first.extensions : {}
  const code = typeof extensions.code === 'string' ? extensions.code : ''
  if (/limit|complexity/i.test(code) || /rate limit|budget exhausted/i.test(message)) {
    return new MondayApiError('rate-limited', message)
  }
  if (/unauthori[sz]ed|authentication/i.test(code) || /not authenticated/i.test(message)) {
    return new MondayApiError('unauthorized', message)
  }
  return new MondayApiError('api', message)
}

export function classifyMondayResponse(status: number, body: unknown): Record<string, unknown> {
  if (status === 401 || status === 403) {
    throw new MondayApiError('unauthorized', 'monday.com rejected the API token.')
  }
  if (status === 429) {
    throw new MondayApiError('rate-limited', 'monday.com rate limit reached.')
  }
  if (!isRecord(body)) {
    throw new MondayApiError('api', `monday.com returned an unexpected response (HTTP ${status}).`)
  }
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw classifyGraphqlErrors(body.errors)
  }
  if (typeof body.error_message === 'string') {
    throw classifyGraphqlErrors([
      { message: body.error_message, extensions: { code: body.error_code } }
    ])
  }
  if (status < 200 || status >= 300 || !isRecord(body.data)) {
    throw new MondayApiError('api', `monday.com request failed (HTTP ${status}).`)
  }
  return body.data
}

export function createMondayQueryRunner(token: string): MondayQueryRunner {
  return async (query, variables) => {
    assertReadOnlyMondayQuery(query)
    let response: Response
    try {
      response = await getMainHttpClient().fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      throw new MondayApiError('network', error instanceof Error ? error.message : String(error))
    }
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON bodies fall through to the status-based classification.
    }
    return classifyMondayResponse(response.status, body)
  }
}
