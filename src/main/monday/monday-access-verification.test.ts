import { describe, expect, it } from 'vitest'
import { verifyMondayAccess } from './monday-access-verification'
import type { MondayQueryRunner } from './monday-graphql-client'

function recordingRunner(data: Record<string, unknown>): {
  run: MondayQueryRunner
  calls: { query: string; variables: Record<string, unknown> }[]
} {
  const calls: { query: string; variables: Record<string, unknown> }[] = []
  return {
    calls,
    run: async (query, variables) => {
      calls.push({ query, variables })
      return data
    }
  }
}

const ROWS = {
  me: { name: 'Heather' },
  boards: [
    { id: '1', type: 'board', url: 'https://x.monday.com/boards/1' },
    { id: '100', type: 'document', url: 'https://x.monday.com/boards/100' }
  ]
}

describe('verifyMondayAccess', () => {
  it('sorts references into boards and docs by monday type in one lookup', async () => {
    const { run, calls } = recordingRunner(ROWS)
    await expect(verifyMondayAccess(run, ['1'], ['100'])).resolves.toEqual({
      connectedAs: 'Heather',
      boardIds: ['1'],
      docs: [{ objectId: '100', url: 'https://x.monday.com/docs/100' }]
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].variables).toEqual({ ids: ['1', '100'] })
    expect(calls[0].query.trimStart().startsWith('query')).toBe(true)
  })

  it('recognises a doc pasted as a bare id', async () => {
    const { run } = recordingRunner(ROWS)
    await expect(verifyMondayAccess(run, ['1', '100'])).resolves.toMatchObject({
      boardIds: ['1'],
      docs: [{ objectId: '100' }]
    })
  })

  it('names references the token cannot see', async () => {
    const { run } = recordingRunner({ me: { name: 'Heather' }, boards: [] })
    await expect(verifyMondayAccess(run, [], ['100'])).rejects.toMatchObject({
      kind: 'doc-not-found',
      message: '100'
    })
    await expect(verifyMondayAccess(run, ['9'], ['100'])).rejects.toMatchObject({
      kind: 'board-not-found',
      message: '9, 100'
    })
  })
})
