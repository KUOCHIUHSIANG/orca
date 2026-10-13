import type { MondayDocRef } from '../../shared/monday-calendar-types'
import { MondayApiError, type MondayQueryRunner } from './monday-graphql-client'
import { asArray, asString, isRecord } from '../untrusted-json-guards'

// Why: a monday doc's object id is also a board of type "document", so one boards() lookup
// both verifies access and tells boards from docs — a bare id works for either.
const VERIFY_QUERY = `query ($ids: [ID!]) {
  me { name }
  boards(ids: $ids) { id type url }
}`

export type MondayAccessResult = {
  connectedAs: string | null
  boardIds: string[]
  docs: MondayDocRef[]
}

/** Confirms the token sees every reference and sorts them into boards and docs by monday's own type. */
export async function verifyMondayAccess(
  run: MondayQueryRunner,
  boardIds: string[],
  docObjectIds: string[] = []
): Promise<MondayAccessResult> {
  const ids = [...new Set([...boardIds, ...docObjectIds])]
  const data = await run(VERIFY_QUERY, { ids })
  const found = new Map<string, { type: string | null; url: string | null }>()
  for (const row of asArray(data.boards)) {
    const id = isRecord(row) ? asString(row.id) : null
    if (isRecord(row) && id) {
      found.set(id, { type: asString(row.type), url: asString(row.url) })
    }
  }
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length > 0) {
    const onlyDocs = missing.every((id) => docObjectIds.includes(id) && !boardIds.includes(id))
    throw new MondayApiError(onlyDocs ? 'doc-not-found' : 'board-not-found', missing.join(', '))
  }
  const isDoc = (id: string): boolean => found.get(id)?.type === 'document'
  return {
    connectedAs: isRecord(data.me) ? asString(data.me.name) : null,
    boardIds: ids.filter((id) => !isDoc(id)),
    docs: ids.filter(isDoc).map((objectId) => ({
      objectId,
      url: (found.get(objectId)?.url ?? '').replace('/boards/', '/docs/')
    }))
  }
}
