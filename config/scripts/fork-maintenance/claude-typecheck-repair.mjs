// Hands typecheck errors left by a fork sync (upstream renamed or reshaped what fork code uses) to
// headless Claude Code, so the app's update button can still finish the sync.
import { FILE_TOOLS, READ_ONLY_GIT_TOOLS, runClaudeHeadless } from './claude-headless.mjs'

const MAX_OUTPUT_CHARS = 40_000
// Why exact commands: piped or chained variants would need approval a headless run cannot give.
const TYPECHECK_TOOLS = ['pnpm tc', 'pnpm tc:node', 'pnpm tc:web', 'pnpm tc:cli'].map(
  (command) => `Bash(${command})`
)
const ALLOWED_TOOLS = [...FILE_TOOLS, ...READ_ONLY_GIT_TOOLS, ...TYPECHECK_TOOLS]

function buildPrompt({ onto, base, output }) {
  return [
    `This fork branch was just rebased onto upstream release ${onto}, and \`pnpm tc\` now fails:`,
    '',
    '```',
    output.slice(-MAX_OUTPUT_CHARS),
    '```',
    '',
    `The fork's own commits are \`git log ${onto}..HEAD\`; use \`git show\` on them to see what each intended, and \`git diff ${base} ${onto} -- <path>\` for what upstream changed in a file.`,
    "Fix the errors by adapting the fork's code to the new upstream code; do not revert upstream changes. Follow AGENTS.md.",
    'Run `pnpm tc` (or `pnpm tc:node` / `pnpm tc:web` / `pnpm tc:cli`) exactly as written, without pipes, to check your fix.',
    'Only edit files. Do not stage or commit; the sync script commits your changes.',
    'If you cannot fix an error with confidence, leave it and say why.',
    'Finish with a brief summary in Traditional Chinese, one short line per file you changed.'
  ].join('\n')
}

/** Returns `{ ok: true, summary }` or `{ ok: false, reason }`; the caller re-runs the typecheck. */
export function repairTypecheckWithClaude({
  cwd,
  onto,
  base,
  output,
  claudeProgram,
  claudeArgsPrefix
}) {
  console.log('\n[sync-upstream] Asking Claude Code to fix the typecheck errors')
  return runClaudeHeadless({
    cwd,
    prompt: buildPrompt({ onto, base, output }),
    allowedTools: ALLOWED_TOOLS,
    claudeProgram,
    claudeArgsPrefix
  })
}
