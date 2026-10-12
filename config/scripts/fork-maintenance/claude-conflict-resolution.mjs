// Hands a paused rebase step's conflicts to headless Claude Code, so the app's update button can
// finish a sync without someone resolving them by hand.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const CLAUDE_TIMEOUT_MS = 20 * 60 * 1000
// Why no staging tools beyond `git rm`: the script verifies the files before it stages and continues.
const ALLOWED_TOOLS = [
  'Read',
  'Edit',
  'Write',
  'Grep',
  'Glob',
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Bash(git show:*)',
  'Bash(git status:*)',
  'Bash(git rm:*)'
]
const CONFLICT_MARKER = /^(<{7}|>{7}) /gm

function markerCount(text) {
  return text.match(CONFLICT_MARKER)?.length ?? 0
}

function stageText(cwd, stage, file) {
  try {
    return execFileSync('git', ['show', `:${stage}:${file}`], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
  } catch {
    return ''
  }
}

/** Markers beyond what either side already contains (e.g. conflict fixtures) are leftovers. */
function stillConflicted(cwd, file) {
  const fullPath = path.join(cwd, file)
  if (!existsSync(fullPath)) {
    return false
  }
  const expected = Math.max(
    markerCount(stageText(cwd, 2, file)),
    markerCount(stageText(cwd, 3, file))
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
    'Only edit files. Do not stage, commit, or run git commands that change state; the sync script verifies and continues the rebase itself. If the right resolution is deleting a file, use `git rm <file>`.',
    'If you cannot resolve a conflict with confidence, leave its markers in place so the update stops for a manual resolution.',
    'Finish with one line per file describing how you resolved it.'
  ].join('\n')
}

/**
 * Runs `claude -p` on the conflicted files of the current rebase step and stages them once no
 * conflict markers are left. Returns `{ ok: false, reason }` when Claude fails or gives up.
 */
export function resolveConflictsWithClaude({
  cwd,
  files,
  onto,
  claudeProgram = 'claude',
  claudeArgsPrefix = []
}) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const commit = git('rev-parse', '--short', 'REBASE_HEAD')
  const subject = git('log', '-1', '--format=%s', 'REBASE_HEAD')
  console.log(`\n[sync-upstream] Asking Claude Code to resolve ${files.join(', ')} in "${subject}"`)

  const result = spawnSync(
    claudeProgram,
    [
      ...claudeArgsPrefix,
      '-p',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      ALLOWED_TOOLS.join(',')
    ],
    {
      cwd,
      input: buildPrompt({ files, commit, subject, onto }),
      stdio: ['pipe', 'inherit', 'inherit'],
      timeout: CLAUDE_TIMEOUT_MS
    }
  )
  if (result.error?.code === 'ENOENT') {
    return { ok: false, reason: `找不到 ${claudeProgram} 指令` }
  }
  if (result.error?.code === 'ETIMEDOUT') {
    return { ok: false, reason: `Claude Code 超過 ${CLAUDE_TIMEOUT_MS / 60000} 分鐘未完成` }
  }
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      reason: `Claude Code 執行失敗（${result.error?.message ?? `exit ${result.status}`}）`
    }
  }

  const leftover = files.filter((file) => stillConflicted(cwd, file))
  if (leftover.length > 0) {
    return { ok: false, reason: `Claude Code 未解完：${leftover.join(', ')}` }
  }
  git('add', '-A', '--', ...files)
  return { ok: true }
}
