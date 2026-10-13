import { describe, expect, it } from 'vitest'
import {
  assertReadOnlyMondayQuery,
  classifyMondayResponse,
  MondayApiError
} from './monday-graphql-client'

function kindOf(run: () => unknown): string | null {
  try {
    run()
    return null
  } catch (error) {
    return error instanceof MondayApiError ? error.kind : 'other'
  }
}

describe('assertReadOnlyMondayQuery', () => {
  it('allows queries', () => {
    expect(() => assertReadOnlyMondayQuery('  query ($id: ID!) { me { id } }')).not.toThrow()
  })

  it('refuses mutations and anonymous operations', () => {
    expect(() =>
      assertReadOnlyMondayQuery('mutation { change_simple_column_value(item_id: 1) { id } }')
    ).toThrow(MondayApiError)
    expect(() => assertReadOnlyMondayQuery('{ me { id } }')).toThrow(MondayApiError)
  })
})

describe('classifyMondayResponse', () => {
  it('returns data on success', () => {
    expect(classifyMondayResponse(200, { data: { me: { name: 'Heather' } } })).toEqual({
      me: { name: 'Heather' }
    })
  })

  it('maps HTTP auth failures to unauthorized', () => {
    expect(kindOf(() => classifyMondayResponse(401, null))).toBe('unauthorized')
  })

  it('maps rate and complexity limits to rate-limited', () => {
    expect(kindOf(() => classifyMondayResponse(429, null))).toBe('rate-limited')
    expect(
      kindOf(() =>
        classifyMondayResponse(200, {
          errors: [{ message: 'Daily limit', extensions: { code: 'DAILY_LIMIT_EXCEEDED' } }]
        })
      )
    ).toBe('rate-limited')
    expect(
      kindOf(() =>
        classifyMondayResponse(200, {
          error_message: 'Complexity budget exhausted',
          error_code: 'ComplexityException'
        })
      )
    ).toBe('rate-limited')
  })

  it('keeps other GraphQL errors as api errors with their message', () => {
    try {
      classifyMondayResponse(200, { errors: [{ message: 'Field "x" does not exist' }] })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(MondayApiError)
      expect(error).toMatchObject({ kind: 'api', message: 'Field "x" does not exist' })
    }
  })
})
