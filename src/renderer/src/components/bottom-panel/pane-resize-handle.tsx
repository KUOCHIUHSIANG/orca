import { useState } from 'react'
import { cn } from '@/lib/utils'

const KEYBOARD_STEP = 16

export type PaneResizeHandleProps = {
  /** 'x' drags a vertical bar that sets the pane's width; 'y' a horizontal bar that sets its height. */
  axis: 'x' | 'y'
  paneRef: React.RefObject<HTMLElement | null>
  /** Which side of the pane the handle sits on; dragging away from the pane grows it. */
  placement: 'before' | 'after'
  label: string
  min: number
  /** Largest size the pane may take, read when a drag or key press starts. */
  max: () => number
  onResize: (size: number) => void
  /** 'hairline' draws a 1px rule at rest, for dense layouts. */
  appearance?: 'grip' | 'hairline'
}

/** Drag/keyboard splitter for one pixel-sized pane; writes the DOM mid-drag and commits once. */
export function PaneResizeHandle({
  axis,
  paneRef,
  placement,
  label,
  min,
  max,
  onResize,
  appearance = 'grip'
}: PaneResizeHandleProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const property = axis === 'x' ? 'width' : 'height'
  const clamp = (size: number): number => Math.round(Math.max(min, Math.min(max(), size)))
  const currentSize = (pane: HTMLElement): number =>
    axis === 'x' ? pane.getBoundingClientRect().width : pane.getBoundingClientRect().height

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const pane = paneRef.current
    if (!pane || dragging) {
      return
    }
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setDragging(true)
    const start = axis === 'x' ? event.clientX : event.clientY
    const startSize = currentSize(pane)
    const limit = max()
    const direction = placement === 'after' ? 1 : -1
    let nextSize = startSize
    // Why: write the DOM during the drag and commit once, so stores aren't hit per pointermove.
    const onPointerMove = (moveEvent: PointerEvent): void => {
      const position = axis === 'x' ? moveEvent.clientX : moveEvent.clientY
      nextSize = Math.round(
        Math.max(min, Math.min(limit, startSize + direction * (position - start)))
      )
      pane.style[property] = `${nextSize}px`
    }
    const onPointerEnd = (): void => {
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', onPointerEnd)
      handle.removeEventListener('pointercancel', onPointerEnd)
      setDragging(false)
      onResize(nextSize)
    }
    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerEnd)
    handle.addEventListener('pointercancel', onPointerEnd)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const pane = paneRef.current
    const grow = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
    const shrink = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
    if (!pane || (event.key !== grow && event.key !== shrink)) {
      return
    }
    event.preventDefault()
    const step = (event.shiftKey ? 2 : 1) * KEYBOARD_STEP
    const toward = event.key === grow ? 1 : -1
    onResize(clamp(currentSize(pane) + toward * (placement === 'after' ? step : -step)))
  }

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      tabIndex={0}
      className={cn(
        'tab-group-split-resize-handle outline-none focus-visible:bg-ring/30',
        axis === 'x' ? 'is-vertical' : 'is-horizontal',
        appearance === 'hairline' && 'is-hairline',
        dragging && 'is-dragging'
      )}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  )
}
