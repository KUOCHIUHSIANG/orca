import { useEffect } from 'react'
import { create } from 'zustand'
import type { DetachedPage } from '../../../../shared/detached-pages'
import { canDetachPages } from './detached-page-location'

type DetachedPagesState = {
  openPages: readonly DetachedPage[]
}

const useDetachedPagesStore = create<DetachedPagesState>(() => ({ openPages: [] }))

let subscribers = 0
let unsubscribe: (() => void) | null = null

function startTracking(): () => void {
  subscribers += 1
  if (subscribers === 1 && canDetachPages()) {
    const api = window.api.detachedPages
    unsubscribe = api.onChanged((openPages) => useDetachedPagesStore.setState({ openPages }))
    void api
      .list()
      .then((openPages) => useDetachedPagesStore.setState({ openPages }))
      .catch(() => undefined)
  }
  return () => {
    subscribers -= 1
    if (subscribers === 0) {
      unsubscribe?.()
      unsubscribe = null
    }
  }
}

/** Whether `page` is showing in its own window right now. */
export function useDetachedPageOpen(page: DetachedPage): boolean {
  useEffect(startTracking, [])
  return useDetachedPagesStore((state) => state.openPages.includes(page))
}
