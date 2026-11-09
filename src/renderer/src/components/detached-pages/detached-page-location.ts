import { isDetachedPage, type DetachedPage } from '../../../../shared/detached-pages'
import { isWebClientLocation } from '@/lib/web-client-location'

/** The page this window was opened for, or null in the main window. */
export function currentDetachedPage(): DetachedPage | null {
  if (
    typeof window === 'undefined' ||
    !window.location?.pathname?.endsWith('/detached-page.html')
  ) {
    return null
  }
  const page = new URLSearchParams(window.location.search).get('page')
  return isDetachedPage(page) ? page : null
}

export function isDetachedPageWindow(): boolean {
  return currentDetachedPage() !== null
}

/** Windows live in this computer's main process; web clients have none to open. */
export function canDetachPages(): boolean {
  return (
    !isWebClientLocation() && typeof window !== 'undefined' && Boolean(window.api?.detachedPages)
  )
}
