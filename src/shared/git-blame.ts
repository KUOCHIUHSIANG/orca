import { decodeGitCQuotedPath } from './git-cquoted-path'

/** Git reports lines that differ from HEAD (unsaved buffer or uncommitted edits) as this commit. */
export const GIT_BLAME_UNCOMMITTED_SHA = '0000000000000000000000000000000000000000'
// Why: porcelain echoes every line back, so a huge file costs several times its size on the wire.
export const GIT_BLAME_MAX_CONTENT_LENGTH = 1024 * 1024

export type GitBlameCommit = {
  sha: string
  author: string
  authorEmail: string
  /** Epoch milliseconds. */
  authorTime: number
  summary: string
  /** The file's path in this commit. */
  path: string
  /** Where the line lived before this commit; absent when this commit added the file. */
  previousSha?: string
  previousPath?: string
}

export type GitBlameResult = {
  commits: GitBlameCommit[]
  /** `lines[i]` describes line i + 1 as [index into `commits`, 1-based line in that commit's file]. */
  lines: [commitIndex: number, originalLine: number][]
  /** Set when the file lives in a submodule: its path from the worktree root; SHAs belong to it. */
  submodulePath?: string
}

/** What the hover card shows for a submodule commit, read in the submodule's own repo. */
export type GitBlameSubmoduleCommit = {
  message: string | null
  remoteUrl: string | null
}

export type GitBlameOptions = {
  /** Unsaved buffer to blame instead of the working-tree file, so line numbers match the editor. */
  contents?: string
}

export type GitBlameExecutor = (
  args: string[],
  cwd: string,
  stdin?: string
) => Promise<{ stdout: string }>

const HEADER_LINE = /^([0-9a-f]{40}|[0-9a-f]{64}) (\d+) (\d+)(?: \d+)?$/

function stripEmailBrackets(value: string): string {
  return value.startsWith('<') && value.endsWith('>') ? value.slice(1, -1) : value
}

export function parseGitBlamePorcelain(stdout: string): GitBlameResult {
  const commits: GitBlameCommit[] = []
  const indexBySha = new Map<string, number>()
  const lines: GitBlameResult['lines'] = []
  let current: GitBlameCommit | null = null
  let originalLine = 0
  let finalLine = 0

  for (const line of stdout.split('\n')) {
    if (line.startsWith('\t')) {
      if (current) {
        lines[finalLine - 1] = [indexBySha.get(current.sha) ?? 0, originalLine]
      }
      continue
    }
    const header = HEADER_LINE.exec(line)
    if (header) {
      const sha = header[1]
      originalLine = Number(header[2])
      finalLine = Number(header[3])
      const known = indexBySha.get(sha)
      if (known !== undefined) {
        current = commits[known]
        continue
      }
      current = { sha, author: '', authorEmail: '', authorTime: 0, summary: '', path: '' }
      indexBySha.set(sha, commits.length)
      commits.push(current)
      continue
    }
    if (!current) {
      continue
    }
    const space = line.indexOf(' ')
    const key = space === -1 ? line : line.slice(0, space)
    const value = space === -1 ? '' : line.slice(space + 1)
    if (key === 'author') {
      current.author = value
    } else if (key === 'author-mail') {
      current.authorEmail = stripEmailBrackets(value)
    } else if (key === 'author-time') {
      current.authorTime = Number(value) * 1000
    } else if (key === 'summary') {
      current.summary = value
    } else if (key === 'filename' && !current.path) {
      current.path = decodeGitCQuotedPath(value)
    } else if (key === 'previous' && !current.previousSha) {
      const pathStart = value.indexOf(' ')
      if (pathStart !== -1) {
        current.previousSha = value.slice(0, pathStart)
        current.previousPath = decodeGitCQuotedPath(value.slice(pathStart + 1))
      }
    }
  }
  // Why: a sparse slot would serialize as null and break the tuple contract on the wire.
  for (let index = 0; index < lines.length; index += 1) {
    lines[index] ??= [0, index + 1]
  }
  return { commits, lines }
}

/** Blames `relativePath` under `cwd`; every host funnels its untrusted wire params through here. */
export async function loadGitBlameFromExecutor(
  git: GitBlameExecutor,
  cwd: string,
  relativePath: string,
  options: GitBlameOptions = {}
): Promise<GitBlameResult> {
  if (!relativePath || relativePath.startsWith('-')) {
    throw new Error('Invalid blame path')
  }
  const contents = typeof options.contents === 'string' ? options.contents : undefined
  if (contents !== undefined && contents.length > GIT_BLAME_MAX_CONTENT_LENGTH) {
    throw new Error('File is too large to blame')
  }
  const blame = async (repoCwd: string, path: string): Promise<GitBlameResult> => {
    const { stdout } = await git(
      ['blame', '--porcelain', ...(contents === undefined ? [] : ['--contents', '-']), '--', path],
      repoCwd,
      contents
    )
    return parseGitBlamePorcelain(stdout)
  }
  try {
    return await blame(cwd, relativePath)
  } catch (error) {
    // Why only on failure: the outer repo can't blame a submodule's file, and asking first would
    // cost every other blame an extra git process.
    const submodule = await findBlameSubmodule(git, cwd, relativePath)
    if (!submodule) {
      throw error
    }
    const result = await blame(
      `${cwd.replace(/[\\/]+$/, '')}/${submodule.path}`,
      submodule.innerPath
    )
    return { ...result, submodulePath: submodule.path }
  }
}

/** The innermost repo holding `relativePath` when it isn't the worktree's own, via git's prefix. */
async function findBlameSubmodule(
  git: GitBlameExecutor,
  cwd: string,
  relativePath: string
): Promise<{ path: string; innerPath: string } | null> {
  const slash = relativePath.lastIndexOf('/')
  if (slash <= 0) {
    return null
  }
  const directory = relativePath.slice(0, slash)
  const fileName = relativePath.slice(slash + 1)
  let prefix: string
  try {
    const { stdout } = await git(
      ['rev-parse', '--show-prefix'],
      `${cwd.replace(/[\\/]+$/, '')}/${directory}`
    )
    prefix = stdout.trim().replace(/\/$/, '')
  } catch {
    return null
  }
  if (prefix === directory || !(prefix === '' || directory.endsWith(`/${prefix}`))) {
    return null
  }
  const path = prefix === '' ? directory : directory.slice(0, -prefix.length - 1)
  return { path, innerPath: prefix === '' ? fileName : `${prefix}/${fileName}` }
}
