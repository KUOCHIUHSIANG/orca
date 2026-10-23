import type { BaseRefSearchResult } from '../../../../../shared/repo-types'

export type LocalBranchRow = {
  name: string
  current: boolean
  /** Another workspace already has this branch checked out; git refuses a second checkout. */
  openIn: { worktreeId: string; label: string } | null
}

export type RemoteBranchRow = {
  ref: string
  /** Name git's checkout DWIM resolves to: the existing local branch or a new tracking one. */
  localName: string
  hasLocal: boolean
}

function matchesQuery(name: string, query: string): boolean {
  return query.length === 0 || name.toLowerCase().includes(query.toLowerCase())
}

export function buildLocalBranchRows(
  branches: readonly string[],
  current: string | null,
  query: string,
  openElsewhere: ReadonlyMap<string, { worktreeId: string; label: string }>
): LocalBranchRow[] {
  return branches
    .filter((name) => matchesQuery(name, query))
    .map((name) => ({
      name,
      current: name === current,
      openIn: name === current ? null : (openElsewhere.get(name) ?? null)
    }))
}

export function buildRemoteBranchRows(
  results: readonly BaseRefSearchResult[],
  localBranches: readonly string[]
): RemoteBranchRow[] {
  const local = new Set(localBranches)
  const rows: RemoteBranchRow[] = []
  for (const { refName, localBranchName } of results) {
    if (refName === localBranchName || local.has(refName) || refName.startsWith('refs/heads/')) {
      continue
    }
    rows.push({
      ref: refName.replace(/^refs\/remotes\//, ''),
      localName: localBranchName,
      hasLocal: local.has(localBranchName)
    })
  }
  return rows
}
