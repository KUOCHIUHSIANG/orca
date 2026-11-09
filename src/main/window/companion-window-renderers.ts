import type { WebContents } from 'electron'
import { isDashboardPopoutRenderer } from './dashboard-popout-window'
import { isDetachedPageRenderer } from './detached-page-window'

/** Orca's secondary page windows: the dashboard popout and pages moved into their own window. */
export function isCompanionPageRenderer(sender: WebContents): boolean {
  return isDashboardPopoutRenderer(sender) || isDetachedPageRenderer(sender)
}
