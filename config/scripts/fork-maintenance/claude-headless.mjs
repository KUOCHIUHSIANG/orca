// Runs headless Claude Code for a fork sync step; its final message becomes the step's summary.
import { spawnSync } from 'node:child_process'

const CLAUDE_TIMEOUT_MS = 20 * 60 * 1000

export const READ_ONLY_GIT_TOOLS = [
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Bash(git show:*)',
  'Bash(git status:*)',
  'Bash(git grep:*)'
]
export const FILE_TOOLS = ['Read', 'Edit', 'Write', 'Grep', 'Glob']
// Why so strict: the final message is shown verbatim on Orca's update card.
export const SUMMARY_INSTRUCTION =
  'Your final message is shown to the user as-is: write only the summary, in Traditional Chinese, one short line per file you changed (`- <file>：<what you did>`), with no preamble or closing remarks.'

function parseResult(stdout) {
  try {
    const output = JSON.parse(stdout)
    return {
      isError: output.is_error === true,
      text: typeof output.result === 'string' ? output.result.trim() : ''
    }
  } catch {
    return { isError: false, text: stdout.trim() }
  }
}

/** Returns `{ ok: true, summary }`, or `{ ok: false, reason }` when Claude cannot run or errors out. */
export function runClaudeHeadless({
  cwd,
  prompt,
  allowedTools,
  claudeProgram = 'claude',
  claudeArgsPrefix = []
}) {
  const result = spawnSync(
    claudeProgram,
    [
      ...claudeArgsPrefix,
      '-p',
      '--output-format',
      'json',
      // Why: the user's MCP servers and connectors only slow startup and leak status into the summary.
      '--strict-mcp-config',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      allowedTools.join(',')
    ],
    {
      cwd,
      input: prompt,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
      timeout: CLAUDE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024
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
  const { isError, text } = parseResult(result.stdout ?? '')
  console.log(`\n[sync-upstream] Claude Code:\n${text}`)
  if (isError) {
    return { ok: false, reason: `Claude Code 執行失敗（${text.slice(0, 120)}）` }
  }
  return { ok: true, summary: text }
}
