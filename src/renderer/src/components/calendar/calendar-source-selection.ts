/** Toggles one source in a filter where null means "all"; the last checked source cannot be cleared. */
export function toggleSourceSelection(
  selected: readonly string[] | null,
  sourceIds: readonly string[],
  sourceId: string
): string[] | null {
  const current = selected ?? sourceIds
  const next = current.includes(sourceId)
    ? current.filter((id) => id !== sourceId)
    : [...current, sourceId]
  if (next.length === 0) {
    return selected ? [...selected] : null
  }
  return sourceIds.every((id) => next.includes(id))
    ? null
    : sourceIds.filter((id) => next.includes(id))
}
