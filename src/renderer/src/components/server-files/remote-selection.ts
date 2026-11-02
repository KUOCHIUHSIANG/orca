export type SelectionModifiers = { toggle: boolean; range: boolean }

/** Cmd on macOS, Ctrl elsewhere, as Finder and Explorer do. */
export function selectionModifiers(event: {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}): SelectionModifiers {
  const isMac = navigator.userAgent.includes('Mac')
  return { toggle: isMac ? event.metaKey : event.ctrlKey, range: event.shiftKey }
}

export function nextSelection(
  order: readonly string[],
  selected: readonly string[],
  anchor: string | null,
  clicked: string,
  modifiers: SelectionModifiers
): { selected: string[]; anchor: string } {
  if (modifiers.range && anchor && order.includes(anchor)) {
    const from = order.indexOf(anchor)
    const to = order.indexOf(clicked)
    const [start, end] = from <= to ? [from, to] : [to, from]
    const range = order.slice(start, end + 1)
    return {
      selected: modifiers.toggle ? [...new Set([...selected, ...range])] : range,
      anchor
    }
  }
  if (modifiers.toggle) {
    return {
      selected: selected.includes(clicked)
        ? selected.filter((path) => path !== clicked)
        : [...selected, clicked],
      anchor: clicked
    }
  }
  return { selected: [clicked], anchor: clicked }
}
