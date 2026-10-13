import { describe, expect, it } from 'vitest'
import type { MondayQueryRunner } from './monday-graphql-client'
import { fetchMondayDocList, fetchMondayDocMarkdown } from './monday-docs'

function runnerReturning(data: Record<string, unknown>): {
  run: MondayQueryRunner
  queries: string[]
} {
  const queries: string[] = []
  return {
    queries,
    run: async (query) => {
      queries.push(query)
      return data
    }
  }
}

describe('fetchMondayDocList', () => {
  it('returns subscribed docs in settings order and drops unseen ones', async () => {
    const { run } = runnerReturning({
      docs: [
        { id: '2', object_id: '200', name: 'Spec', url: 'https://x.monday.com/docs/200' },
        {
          id: '1',
          object_id: '100',
          name: 'Notes',
          url: 'https://x.monday.com/docs/100',
          updated_at: '2026-10-13'
        }
      ]
    })
    const docs = await fetchMondayDocList(run, ['100', '200', '300'])
    expect(docs.map((doc) => [doc.id, doc.name, doc.updatedAt])).toEqual([
      ['1', 'Notes', '2026-10-13'],
      ['2', 'Spec', null]
    ])
  })

  it('skips the request entirely when nothing is subscribed', async () => {
    const { run, queries } = runnerReturning({ docs: [{ id: '1' }] })
    await expect(fetchMondayDocList(run, [])).resolves.toEqual([])
    expect(queries).toEqual([])
  })
})

describe('fetchMondayDocMarkdown', () => {
  it('returns the exported markdown through a read-only query', async () => {
    const { run, queries } = runnerReturning({
      export_markdown_from_doc: { success: true, markdown: '# Title\n\nBody', error: null }
    })
    await expect(fetchMondayDocMarkdown(run, '42')).resolves.toBe('# Title\n\nBody')
    expect(queries[0].trimStart().startsWith('query')).toBe(true)
  })

  it('surfaces monday export failures', async () => {
    const { run } = runnerReturning({
      export_markdown_from_doc: { success: false, markdown: null, error: 'Doc not found' }
    })
    await expect(fetchMondayDocMarkdown(run, '42')).rejects.toMatchObject({
      kind: 'api',
      message: 'Doc not found'
    })
  })
})
