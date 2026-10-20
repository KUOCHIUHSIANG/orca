import type { GitBlameCommit, GitBlameResult } from './git-blame'

function readCommit(value: unknown): GitBlameCommit | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const sha: unknown = Reflect.get(value, 'sha')
  const author: unknown = Reflect.get(value, 'author')
  const authorEmail: unknown = Reflect.get(value, 'authorEmail')
  const authorTime: unknown = Reflect.get(value, 'authorTime')
  const summary: unknown = Reflect.get(value, 'summary')
  const path: unknown = Reflect.get(value, 'path')
  const previousSha: unknown = Reflect.get(value, 'previousSha')
  const previousPath: unknown = Reflect.get(value, 'previousPath')
  if (
    typeof sha !== 'string' ||
    typeof author !== 'string' ||
    typeof authorEmail !== 'string' ||
    typeof authorTime !== 'number' ||
    typeof summary !== 'string' ||
    typeof path !== 'string'
  ) {
    return null
  }
  return {
    sha,
    author,
    authorEmail,
    authorTime,
    summary,
    path,
    ...(typeof previousSha === 'string' ? { previousSha } : {}),
    ...(typeof previousPath === 'string' ? { previousPath } : {})
  }
}

function readLine(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null
  }
  const [commitIndex, originalLine]: unknown[] = value
  return typeof commitIndex === 'number' && typeof originalLine === 'number'
    ? [commitIndex, originalLine]
    : null
}

/** Checks a blame result that crossed a process or SSH boundary before callers index into it. */
export function readGitBlameWireResult(value: unknown): GitBlameResult {
  const rawCommits: unknown =
    value && typeof value === 'object' ? Reflect.get(value, 'commits') : null
  const rawLines: unknown = value && typeof value === 'object' ? Reflect.get(value, 'lines') : null
  if (!Array.isArray(rawCommits) || !Array.isArray(rawLines)) {
    throw new Error('Invalid git blame response')
  }
  const commits = rawCommits.map(readCommit)
  const lines = rawLines.map(readLine)
  if (
    commits.some((commit) => commit === null) ||
    lines.some((line) => line === null || line[0] < 0 || line[0] >= commits.length)
  ) {
    throw new Error('Invalid git blame response')
  }
  const submodulePath: unknown =
    value && typeof value === 'object' ? Reflect.get(value, 'submodulePath') : undefined
  return {
    commits: commits.filter((commit): commit is GitBlameCommit => commit !== null),
    lines: lines.filter((line): line is [number, number] => line !== null),
    ...(typeof submodulePath === 'string' ? { submodulePath } : {})
  }
}
