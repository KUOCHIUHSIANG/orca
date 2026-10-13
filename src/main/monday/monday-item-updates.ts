import type {
  MondayUpdate,
  MondayUpdateAttachment,
  MondayUpdateEntry
} from '../../shared/monday-calendar-types'
import type { MondayQueryRunner } from './monday-graphql-client'
import { asArray, asString, isRecord } from './monday-json-guards'

const UPDATES_LIMIT = 50
const ENTRY_FIELDS = 'id body created_at creator { name } assets { id name public_url }'

const ITEM_UPDATES_QUERY = `query ($itemIds: [ID!]) {
  items(ids: $itemIds) {
    updates(limit: ${UPDATES_LIMIT}) { ${ENTRY_FIELDS} replies { ${ENTRY_FIELDS} } }
  }
}`

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * monday's inline images point at login-only protected_static URLs that Orca can't load,
 * so swap in each asset's signed URL and drop the ones that can't be resolved.
 */
export function inlineMondayAssetUrls(
  html: string,
  assetUrls: ReadonlyMap<string, string>
): { html: string; inlinedIds: Set<string> } {
  const inlinedIds = new Set<string>()
  const rewritten = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const assetId = /data-asset_id="(\d+)"/i.exec(tag)?.[1]
    const url = assetId ? assetUrls.get(assetId) : undefined
    if (assetId && url) {
      inlinedIds.add(assetId)
      return `<img src="${escapeAttribute(url)}" alt="">`
    }
    return /protected_static/i.test(tag) ? '' : tag
  })
  return { html: rewritten, inlinedIds }
}

function readAttachments(value: unknown): MondayUpdateAttachment[] {
  return asArray(value).flatMap((asset) => {
    const id = isRecord(asset) ? asString(asset.id) : null
    const url = isRecord(asset) ? asString(asset.public_url) : null
    if (!isRecord(asset) || !id || !url) {
      return []
    }
    return [{ id, name: asString(asset.name) ?? id, url }]
  })
}

function mapEntry(raw: unknown): MondayUpdateEntry | null {
  const id = isRecord(raw) ? asString(raw.id) : null
  if (!isRecord(raw) || !id) {
    return null
  }
  const attachments = readAttachments(raw.assets)
  const { html, inlinedIds } = inlineMondayAssetUrls(
    asString(raw.body) ?? '',
    new Map(attachments.map((attachment) => [attachment.id, attachment.url]))
  )
  return {
    id,
    authorName: isRecord(raw.creator) ? asString(raw.creator.name) : null,
    createdAt: asString(raw.created_at),
    bodyHtml: html,
    attachments: attachments.filter((attachment) => !inlinedIds.has(attachment.id))
  }
}

export async function fetchMondayItemUpdates(
  run: MondayQueryRunner,
  itemId: string
): Promise<MondayUpdate[]> {
  const data = await run(ITEM_UPDATES_QUERY, { itemIds: [itemId] })
  const item = asArray(data.items).find(isRecord)
  return asArray(item?.updates).flatMap((raw) => {
    const entry = mapEntry(raw)
    if (!entry || !isRecord(raw)) {
      return []
    }
    const replies = asArray(raw.replies)
      .map(mapEntry)
      .filter((reply): reply is MondayUpdateEntry => reply !== null)
    return [{ ...entry, replies }]
  })
}
