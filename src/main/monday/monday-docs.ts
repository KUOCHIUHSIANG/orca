import type { MondayDocSummary } from '../../shared/monday-calendar-types'
import { MondayApiError, type MondayQueryRunner } from './monday-graphql-client'
import { asArray, asString, isRecord } from './monday-json-guards'

const DOC_LIST_QUERY = `query ($objectIds: [ID!]) {
  docs(object_ids: $objectIds) { id object_id name url updated_at }
}`

const DOC_MARKDOWN_QUERY = `query ($docId: ID!) {
  export_markdown_from_doc(docId: $docId) { success markdown error }
}`

function mapDoc(raw: unknown): MondayDocSummary[] {
  if (!isRecord(raw)) {
    return []
  }
  const id = asString(raw.id)
  const objectId = asString(raw.object_id)
  const url = asString(raw.url)
  if (!id || !objectId || !url) {
    return []
  }
  return [
    { id, objectId, url, name: asString(raw.name) ?? objectId, updatedAt: asString(raw.updated_at) }
  ]
}

/** Subscribed docs in settings order; docs the token can no longer see are dropped. */
export async function fetchMondayDocList(
  run: MondayQueryRunner,
  objectIds: readonly string[]
): Promise<MondayDocSummary[]> {
  // Why: docs(object_ids: []) means "no filter" to monday and would list every doc in the account.
  if (objectIds.length === 0) {
    return []
  }
  const data = await run(DOC_LIST_QUERY, { objectIds })
  const docs = asArray(data.docs).flatMap(mapDoc)
  return objectIds.flatMap((objectId) => docs.filter((doc) => doc.objectId === objectId))
}

export async function fetchMondayDocMarkdown(
  run: MondayQueryRunner,
  docId: string
): Promise<string> {
  const data = await run(DOC_MARKDOWN_QUERY, { docId })
  const result = isRecord(data.export_markdown_from_doc) ? data.export_markdown_from_doc : null
  if (!result || result.success !== true || typeof result.markdown !== 'string') {
    throw new MondayApiError(
      'api',
      asString(result?.error) ?? 'monday.com could not export this doc.'
    )
  }
  return result.markdown
}
