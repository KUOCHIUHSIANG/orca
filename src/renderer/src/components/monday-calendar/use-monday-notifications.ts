import { useSyncExternalStore } from 'react'
import type { MondayNotificationsState } from '../../../../shared/monday-notification-types'

// Why: one subscription feeds both the sidebar badge and the page's bell.
let current: MondayNotificationsState | null = null
let started = false
const listeners = new Set<() => void>()

function publish(next: MondayNotificationsState): void {
  current = next
  for (const listener of listeners) {
    listener()
  }
}

function start(): void {
  // Web clients have no local main process polling monday.com.
  if (started || typeof window.api?.monday?.onNotificationsChanged !== 'function') {
    return
  }
  started = true
  window.api.monday.onNotificationsChanged(publish)
  window.api.monday
    .notifications()
    .then((initial) => {
      // A broadcast that landed first is newer than this snapshot.
      if (current === null) {
        publish(initial)
      }
    })
    .catch((error: unknown) => console.error('Failed to read monday notifications:', error))
}

function subscribe(listener: () => void): () => void {
  start()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMondayNotifications(): MondayNotificationsState | null {
  return useSyncExternalStore(subscribe, () => current)
}
