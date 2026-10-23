const MAX_LISTED_FILES = 5

function gitStderr(error: unknown): string {
  if (!(error instanceof Error)) {
    return ''
  }
  const stderr = 'stderr' in error ? error.stderr : undefined
  if (typeof stderr === 'string' && stderr.trim()) {
    return stderr
  }
  // Why: execFile prefixes the message with the command line; the git output follows it.
  return error.message.replace(/^Command failed:[^\n]*\n?/, '')
}

function overwrittenFiles(stderr: string): string[] {
  return stderr
    .split('\n')
    .filter((line) => line.startsWith('\t'))
    .map((line) => line.trim())
    .filter(Boolean)
}

function formatFileList(files: string[]): string {
  const listed = files.slice(0, MAX_LISTED_FILES).join(', ')
  const rest = files.length - MAX_LISTED_FILES
  return rest > 0 ? `${listed} and ${rest} more` : listed
}

/** Turns git's checkout/branch stderr into one actionable sentence for a toast. */
export function toBranchSwitchError(error: unknown, branch: string): Error {
  const stderr = gitStderr(error)
  if (/would be overwritten by checkout/.test(stderr)) {
    const files = overwrittenFiles(stderr)
    const detail = files.length > 0 ? `: ${formatFileList(files)}` : ''
    return new Error(
      `Switching to '${branch}' would overwrite local changes${detail}. Commit or stash them first.`
    )
  }
  if (/untracked working tree files would be overwritten/.test(stderr)) {
    const files = overwrittenFiles(stderr)
    const detail = files.length > 0 ? `: ${formatFileList(files)}` : ''
    return new Error(
      `Switching to '${branch}' would overwrite untracked files${detail}. Move or remove them first.`
    )
  }
  const usedByWorktree = /is already (?:used by worktree|checked out) at '([^']+)'/.exec(stderr)
  if (usedByWorktree) {
    return new Error(`'${branch}' is already checked out in another worktree: ${usedByWorktree[1]}`)
  }
  if (/matched multiple \(\d+\) remote tracking branches/.test(stderr)) {
    return new Error(
      `'${branch}' exists on more than one remote. Set checkout.defaultRemote or run git checkout --track <remote>/${branch} in a terminal.`
    )
  }
  if (/a branch named '[^']+' already exists/.test(stderr)) {
    return new Error(`A branch named '${branch}' already exists.`)
  }
  if (/is not a valid branch name/.test(stderr)) {
    return new Error(`'${branch}' is not a valid branch name.`)
  }
  const fatal = stderr
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^(fatal|error):/.test(line))
  if (fatal) {
    return new Error(fatal.replace(/^(fatal|error):\s*/, ''))
  }
  return error instanceof Error ? error : new Error(`Could not switch to '${branch}'.`)
}
