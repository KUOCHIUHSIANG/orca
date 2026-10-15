// Hands a paused rebase step's conflicts to headless Claude Code, so the app's update button can
// finish a sync without someone resolving them by hand.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  FILE_TOOLS,
  READ_ONLY_GIT_TOOLS,
  runClaudeHeadless,
  SUMMARY_INSTRUCTION
} from './claude-headless.mjs'

// Why no staging tools beyond `git rm`: the script verifies the files before it stages and continues.
const ALLOWED_TOOLS = [...FILE_TOOLS, ...READ_ONLY_GIT_TOOLS, 'Bash(git rm:*)']
const CONFLICT_MARKER = /^(<{7}|>{7}) /gm

function markerCount(text) {
  return text.match(CONFLICT_MARKER)?.length ?? 0
}

function indexText(cwd, stage, file) {
  try {
    return execFileSync('git', ['show', `:${stage}:${file}`], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      // Why: a file is missing from most stages; git's complaint about that is expected noise.
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch {
    return ''
  }
}

/** Markers beyond what the index already holds (e.g. conflict fixtures) are leftovers. */
function stillConflicted(cwd, file) {
  const fullPath = path.join(cwd, file)
  if (!existsSync(fullPath)) {
    return false
  }
  const expected = Math.max(
    markerCount(indexText(cwd, 0, file)),
    markerCount(indexText(cwd, 2, file)),
    markerCount(indexText(cwd, 3, file))
  )
  return markerCount(readFileSync(fullPath, 'utf8')) > expected
}

function buildPrompt({ files, commit, subject, onto }) {
  return [
    'A `git rebase` in this repository is paused on conflicts. Resolve them.',
    `The fork branch is being re-stacked onto upstream release ${onto}.`,
    `The commit being replayed is ${commit} "${subject}".`,
    'In each conflict the HEAD side is the new upstream code plus fork commits already replayed; the other side is that fork commit.',
    '',
    'Conflicted files:',
    ...files.map((file) => `- ${file}`),
    '',
    `Keep upstream's changes and still apply what the fork commit intended. Use \`git show ${commit}\` to see that intent. Follow AGENTS.md.`,
    'If upstream renamed or moved something this commit uses, also update the other files of this commit that reference it.',
    'Only edit files. Do not stage, commit, or run git commands that change state; the sync script verifies and continues the rebase itself. If the right resolution is deleting a file, use `git rm <file>`.',
    'Do not run typecheck or tests: dependencies are not installed for the new upstream yet. The sync script typechecks after the rebase and asks for fixes if needed.',
    'If you cannot resolve a conflict with confidence, leave its markers in place so the update stops for a manual resolution.',
    SUMMARY_INSTRUCTION
  ].join('\n')
}

function changedFiles(cwd, git) {
  const tracked = git('diff', '--name-only')
  const untracked = git('ls-files', '--others', '--exclude-standard')
  return [tracked, untracked].join('\n').split('\n').filter(Boolean)
}

/**
 * Runs Claude on the conflicted files of the current rebase step and stages the whole worktree once
 * no conflict markers are left. Returns `{ ok: true, summary }` or `{ ok: false, reason }`.
 */
export function resolveConflictsWithClaude({ cwd, files, onto, claudeProgram, claudeArgsPrefix }) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const commit = git('rev-parse', '--short', 'REBASE_HEAD')
  const subject = git('log', '-1', '--format=%s', 'REBASE_HEAD')
  console.log(`\n[sync-upstream] Asking Claude Code to resolve ${files.join(', ')} in "${subject}"`)

  const result = runClaudeHeadless({
    cwd,
    prompt: buildPrompt({ files, commit, subject, onto }),
    allowedTools: ALLOWED_TOOLS,
    claudeProgram,
    claudeArgsPrefix
  })
  if (!result.ok) {
    return result
  }

  const touched = [...new Set([...files, ...changedFiles(cwd, git)])]
  const leftover = touched.filter((file) => stillConflicted(cwd, file))
  if (leftover.length > 0) {
    return { ok: false, reason: `Claude Code 未解完：${leftover.join(', ')}` }
  }
  // Why the whole tree: a resolution can need edits outside the conflicted files (e.g. a moved module).
  git('add', '-A')
  return { ok: true, summary: result.summary }
}
