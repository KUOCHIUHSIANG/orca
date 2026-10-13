import { describe, expect, it } from 'vitest'
import type { MondayQueryRunner } from './monday-graphql-client'
import { fetchMondayItemUpdates, inlineMondayAssetUrls } from './monday-item-updates'

const PROTECTED =
  'https://autrontech.monday.com/protected_static/5191736/resources/3310227071/custom_thumbnail_big.png'
const SIGNED = 'https://files-monday-com.s3.amazonaws.com/x/image.png?a=1&b="2"'

describe('inlineMondayAssetUrls', () => {
  it('swaps login-only image sources for signed asset urls', () => {
    const { html, inlinedIds } = inlineMondayAssetUrls(
      `<p>see<br><img src="${PROTECTED}" data-asset_id="3310227071" ></p>`,
      new Map([['3310227071', SIGNED]])
    )
    expect(html).toBe(
      '<p>see<br><img src="https://files-monday-com.s3.amazonaws.com/x/image.png?a=1&amp;b=&quot;2&quot;" alt=""></p>'
    )
    expect([...inlinedIds]).toEqual(['3310227071'])
  })

  it('drops unresolvable protected images and keeps other images', () => {
    const { html } = inlineMondayAssetUrls(
      `<img src="${PROTECTED}" data-asset_id="9"><img src="https://example.com/a.png">`,
      new Map()
    )
    expect(html).toBe('<img src="https://example.com/a.png">')
  })
})

describe('fetchMondayItemUpdates', () => {
  it('maps updates, replies, and attachments not shown inline', async () => {
    const calls: Record<string, unknown>[] = []
    const run: MondayQueryRunner = async (query, variables) => {
      expect(query.trimStart().startsWith('query')).toBe(true)
      calls.push(variables)
      return {
        items: [
          {
            updates: [
              {
                id: '5615724093',
                body: `<p>客戶反應</p><img src="${PROTECTED}" data-asset_id="1">`,
                created_at: '2026-10-08T09:48:31.000Z',
                creator: { name: 'Niki' },
                assets: [
                  { id: '1', name: 'image.png', public_url: 'https://files.example/1.png' },
                  { id: '2', name: 'spec.pdf', public_url: 'https://files.example/2.pdf' }
                ],
                replies: [
                  {
                    id: '5623729354',
                    body: '<p>@Niki 了解</p>',
                    created_at: '2026-10-12T08:23:02.000Z',
                    creator: { name: 'Omar' },
                    assets: []
                  },
                  { body: 'missing id' }
                ]
              }
            ]
          }
        ]
      }
    }

    const updates = await fetchMondayItemUpdates(run, '13236552340')

    expect(calls).toEqual([{ itemIds: ['13236552340'] }])
    expect(updates).toEqual([
      {
        id: '5615724093',
        authorName: 'Niki',
        createdAt: '2026-10-08T09:48:31.000Z',
        bodyHtml: '<p>客戶反應</p><img src="https://files.example/1.png" alt="">',
        attachments: [{ id: '2', name: 'spec.pdf', url: 'https://files.example/2.pdf' }],
        replies: [
          {
            id: '5623729354',
            authorName: 'Omar',
            createdAt: '2026-10-12T08:23:02.000Z',
            bodyHtml: '<p>@Niki 了解</p>',
            attachments: []
          }
        ]
      }
    ])
  })
})
