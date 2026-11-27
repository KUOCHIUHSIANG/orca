// Keeps .git/orca-sync-summary.md: what Claude handled while syncing to a tag.
// src/main/fork-sync-summary.ts parses the `# 同步上游 <tag>` header to show it after the update.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const NOTHING_TO_DO = '不需要 Claude Code 介入。'

/** Returns false when the existing summary for this tag already says everything. */
export function writeSyncSummary({ file, targetTag, notes }) {
  const header = `# 同步上游 ${targetTag}\n\n`
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  // Why keep it: a re-run after a failed build only rebuilds; how this tag was reached still applies.
  const previous = existing.startsWith(header) ? existing.slice(header.length).trim() : ''
  if (previous && notes.length === 0) {
    return false
  }
  const sections = [previous, ...notes].filter((section) => section && section !== NOTHING_TO_DO)
  writeFileSync(file, `${header}${sections.length > 0 ? sections.join('\n\n') : NOTHING_TO_DO}\n`)
  return true
}
