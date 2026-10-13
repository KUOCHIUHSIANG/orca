import { useCallback, useEffect, useRef, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import type { MondayDocSummary, MondayFailure } from '../../../../shared/monday-calendar-types'

// Why: in memory only — these docs can hold credentials, so nothing is written to disk.
let cachedDocs: MondayDocSummary[] | null = null
const cachedMarkdown = new Map<string, string>()

function ipcFailure(error: unknown): MondayFailure {
  return { ok: false, kind: 'api', message: readIpcErrorMessage(error) ?? '' }
}

export type MondayDocsController = {
  docs: MondayDocSummary[] | null
  selectedDoc: MondayDocSummary | null
  select: (docId: string) => void
  markdown: string | null
  loading: boolean
  error: MondayFailure | null
  refresh: () => void
}

/** Loads the subscribed docs list and the selected doc's markdown, only while the Docs tab is shown. */
export function useMondayDocs(docsKey: string, enabled: boolean): MondayDocsController {
  const mountedRef = useMountedRef()
  const [docs, setDocs] = useState<MondayDocSummary[] | null>(cachedDocs)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<MondayFailure | null>(null)
  const contentRequestRef = useRef(0)
  const loadedKeyRef = useRef<string | null>(null)

  const loadContent = useCallback(
    async (docId: string): Promise<void> => {
      const request = ++contentRequestRef.current
      setMarkdown(cachedMarkdown.get(docId) ?? null)
      setLoading(true)
      setError(null)
      let failure: MondayFailure | null = null
      try {
        const result = await window.api.monday.fetchDocContent({ docId })
        if (result.ok) {
          cachedMarkdown.set(docId, result.markdown)
        } else {
          failure = result
        }
      } catch (fetchError) {
        failure = ipcFailure(fetchError)
      }
      // Why: a slow doc must not overwrite the one the user switched to.
      if (!mountedRef.current || request !== contentRequestRef.current) {
        return
      }
      setMarkdown(cachedMarkdown.get(docId) ?? null)
      setError(failure)
      setLoading(false)
    },
    [mountedRef]
  )

  const loadList = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.monday.fetchDocs()
      if (!mountedRef.current) {
        return
      }
      if (!result.ok) {
        setError(result)
        setLoading(false)
        return
      }
      cachedDocs = result.docs
      setDocs(result.docs)
      const next = result.docs.find((doc) => doc.id === selectedDocId) ?? result.docs[0] ?? null
      setSelectedDocId(next?.id ?? null)
      if (next) {
        await loadContent(next.id)
      } else {
        setLoading(false)
      }
    } catch (fetchError) {
      if (mountedRef.current) {
        setError(ipcFailure(fetchError))
        setLoading(false)
      }
    }
  }, [loadContent, mountedRef, selectedDocId])

  useEffect(() => {
    if (enabled && loadedKeyRef.current !== docsKey) {
      loadedKeyRef.current = docsKey
      void loadList()
    }
  }, [docsKey, enabled, loadList])

  const select = useCallback(
    (docId: string): void => {
      setSelectedDocId(docId)
      void loadContent(docId)
    },
    [loadContent]
  )

  return {
    docs,
    selectedDoc: docs?.find((doc) => doc.id === selectedDocId) ?? null,
    select,
    markdown,
    loading,
    error,
    refresh: () => void loadList()
  }
}
