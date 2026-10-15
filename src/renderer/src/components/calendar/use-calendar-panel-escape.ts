import { useEffect, useRef } from 'react'

/** Escape closes a calendar's open side panel without stealing Escape from the page's own popovers. */
export function useCalendarPanelEscape(
  panelOpen: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!panelOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      const target = event.target
      // Why: an unrelated Radix layer (e.g. a sidebar hint) can claim Escape first; focus inside
      // the calendar still means the user is addressing it. Focus elsewhere defers to that layer.
      const insideCalendar = target instanceof Node && containerRef.current?.contains(target)
      if (insideCalendar || (!event.defaultPrevented && target === document.body)) {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    // Why: bubble phase lets this page's own popovers consume Escape first.
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [containerRef, panelOpen])
}
