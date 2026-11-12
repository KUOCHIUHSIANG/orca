export function formatCountLabel(base: string, count: number): string {
  return count > 0 ? `${base} (${count})` : base
}
