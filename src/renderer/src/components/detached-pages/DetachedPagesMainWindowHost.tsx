import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { DetachedPage } from '../../../../shared/detached-pages'
import { canDetachPages, isDetachedPageWindow } from './detached-page-location'
import { answerMainWindowCall } from './main-window-calls'

function showPageHere(page: DetachedPage): void {
  const store = useAppStore.getState()
  if (page === 'monday') {
    store.openMondayPage()
  } else if (page === 'todo') {
    store.openTodoPage()
  } else if (page === 'servers') {
    store.openServersPage()
  }
}

/** Main window: reopens last session's detached windows and serves their requests. */
export function DetachedPagesMainWindowHost(): null {
  useEffect(() => {
    if (!canDetachPages() || isDetachedPageWindow()) {
      return
    }
    const api = window.api.detachedPages
    void api.restore().catch(() => undefined)
    const offDocked = api.onDocked(showPageHere)
    const offCalls = api.onMainWindowCall((request) => void answerMainWindowCall(request))
    return () => {
      offDocked()
      offCalls()
    }
  }, [])
  return null
}
