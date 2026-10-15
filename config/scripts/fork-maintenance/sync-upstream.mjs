#!/usr/bin/env node
// Re-stacks this fork's own commits (custom) onto a newer upstream release tag.
//
//   node config/scripts/fork-maintenance/sync-upstream.mjs v1.4.221 [--push] [--build]
//                                                          [--auto-worktree] [--events]
//
// Steps: fetch upstream tags → back up the branch (replacing the previous backup) → rebase the fork's own commits onto <new> →
// install deps → regenerate (and commit) zh-TW.json → typecheck. --push force-with-lease pushes the branch and fast-forwards origin main to upstream
// main; --build then produces the local arm64 app.
// On a rebase conflict it stops and prints how to continue; rerere replays resolutions it has seen
// and the rebase continues on its own when they cover every conflict.
//
// App mode (Orca's "sync and update" button):
//   --auto-worktree  run in whichever worktree has custom checked out, creating a dedicated
//                    one beside this checkout if none does, so the checkout you develop in is
//                    never switched or blocked by uncommitted work.
//   --events         print `ORCA_SYNC_EVENT <json>` lines (stage / conflict / done). Conflicts
//                    rerere cannot replay go to headless Claude Code; if it cannot resolve them,
//                    abort the rebase so the branch is left exactly as before (exit 2) and list
//                    every conflicting commit from a merge-tree dry run in the conflict event.
//                    Typecheck errors after the rebase also go to Claude and its fix is committed;
//                    any failure before the typecheck passes resets the branch to where it started.
//                    Claude's summaries go to .git/orca-sync-summary.md, which the updated app
//                    shows once after its install restarts it.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { resolveConflictsWithClaude } from './claude-conflict-resolution.mjs'
import { repairTypecheckWithClaude } from './claude-typecheck-repair.mjs'
import { previewRebaseConflicts } from './rebase-conflict-preview.mjs'
import { resolveRebaseBase } from './rebase-base.mjs'
import {
  createProgressReporter,
  estimatedBuildMs,
  gitCommonDir,
  STARTED_AT_ENV
} from './build-progress.mjs'
import { writeSyncSummary } from './sync-summary-file.mjs'

// Why: Orca runs this script through its own binary as Node; the build's Electron children must not inherit that.
delete process.env.ELECTRON_RUN_AS_NODE

const UPSTREAM_REMOTE = 'upstream'
const FORK_REMOTE = 'origin'
const CUSTOM_BRANCH = 'custom'
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/
const CONFLICT_EXIT_CODE = 2
const RERERE = ['-c', 'rerere.enabled=true', '-c', 'rerere.autoUpdate=true']
const ZH_TW_CATALOG = 'src/renderer/src/i18n/locales/zh-TW.json'

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
const scriptRelativePath = path.relative(repoRoot, import.meta.filename)

const args = process.argv.slice(2)
const targetTag = args.find((arg) => !arg.startsWith('--'))
const shouldPush = args.includes('--push')
const shouldBuild = args.includes('--build')
const autoWorktree = args.includes('--auto-worktree')
const eventsMode = args.includes('--events')

function emit(event) {
  if (eventsMode) {
    console.log(`ORCA_SYNC_EVENT ${JSON.stringify(event)}`)
  }
}

// First-run guesses for the status bar's "time left"; measured durations replace them afterwards.
const SYNC_STEPS = [
  { key: 'sync:fetch', defaultMs: 15_000 },
  { key: 'sync:rebase', defaultMs: 20_000 },
  { key: 'sync:install', defaultMs: 90_000 },
  { key: 'sync:verify', defaultMs: 120_000 }
]
// Reports to the status bar; created once the run gets past its preflight checks.
let progress = null

function stage(name) {
  emit({ type: 'stage', stage: name })
  if (name === 'resolve' || name === 'repair') {
    progress?.waitOnClaude()
  } else if (SYNC_STEPS.some((step) => step.key === `sync:${name}`)) {
    progress?.step(`sync:${name}`)
  }
}

function exec(command, commandArgs, env) {
  console.log(`\n$ ${command} ${commandArgs.join(' ')}`)
  execFileSync(command, commandArgs, { cwd: repoRoot, stdio: 'inherit', env })
}

function run(command, commandArgs) {
  try {
    exec(command, commandArgs, process.env)
  } catch (error) {
    // Why: Orca's update card shows only the stderr tail; an uncaught stack trace hides the failed step.
    const step = command === 'node' ? path.basename(commandArgs[0]) : `${command} ${commandArgs[0]}`
    fail(`${step} failed (exit ${error.status ?? error.signal}).`)
  }
}

function succeeds(command, commandArgs, env) {
  try {
    exec(command, commandArgs, env)
    return true
  } catch {
    return false
  }
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

// What Claude did at each step, shown to the user once the update is built.
const notes = []
// App mode: the commit to reset to while the branch holds a sync that has not typechecked yet.
let rollbackTo = null

/** Puts the checkout back on `commit`, including files Claude created and the matching deps. */
function rollBack(commit) {
  try {
    const lockfileChanged = !succeeds('git', [
      'diff',
      '--quiet',
      commit,
      'HEAD',
      '--',
      'pnpm-lock.yaml'
    ])
    execFileSync('git', ['add', '-A'], { cwd: repoRoot, stdio: 'inherit' })
    execFileSync('git', ['reset', '--hard', '--quiet', commit], { cwd: repoRoot, stdio: 'inherit' })
    if (lockfileChanged) {
      succeeds('pnpm', ['install', '--frozen-lockfile'])
    }
    return `${CUSTOM_BRANCH} 已還原到同步前的狀態。`
  } catch {
    return `${CUSTOM_BRANCH} 還原失敗，請手動 git reset --hard ${commit}。`
  }
}

function fail(message) {
  let fullMessage = message
  if (rollbackTo) {
    const commit = rollbackTo
    rollbackTo = null
    fullMessage = `${message} ${rollBack(commit)}`
  }
  progress?.finish('failed')
  console.error(`\n[sync-upstream] ${fullMessage}`)
  process.exit(1)
}

/** Worktree path that has CUSTOM_BRANCH checked out, or null. */
function findCustomBranchWorktree() {
  let worktreePath = null
  for (const line of git('worktree', 'list', '--porcelain').split('\n')) {
    if (line.startsWith('worktree ')) {
      worktreePath = line.slice('worktree '.length)
    } else if (line === `branch refs/heads/${CUSTOM_BRANCH}`) {
      return worktreePath
    }
  }
  return null
}

/** Re-runs this script inside the worktree that owns CUSTOM_BRANCH; never returns. */
function delegateToCustomBranchWorktree() {
  let worktree = findCustomBranchWorktree()
  if (!worktree) {
    worktree = `${repoRoot}-${CUSTOM_BRANCH}`
    if (existsSync(worktree)) {
      fail(`${worktree} exists but is not a worktree of ${CUSTOM_BRANCH}. Move it aside and retry.`)
    }
    run('git', ['worktree', 'add', worktree, CUSTOM_BRANCH])
  }
  console.log(`[sync-upstream] Running in ${CUSTOM_BRANCH} worktree ${worktree}`)
  const forwarded = args.filter((arg) => arg !== '--auto-worktree')
  const child = spawnSync(
    process.execPath,
    [path.join(worktree, scriptRelativePath), ...forwarded],
    {
      cwd: worktree,
      stdio: 'inherit'
    }
  )
  process.exit(child.status ?? 1)
}

/** Deletes upstream tracking refs outside the fetch refspec: --prune never reaches them, and once
 *  their objects are gc'd, fetch negotiation dies on "bad object". */
function dropStaleUpstreamRefs() {
  const keep = `refs/remotes/${UPSTREAM_REMOTE}/main`
  const stale = git('for-each-ref', '--format=%(refname)', `refs/remotes/${UPSTREAM_REMOTE}/`)
    .split('\n')
    .filter((ref) => ref && ref !== keep)
  if (stale.length === 0) {
    return
  }
  console.log(`[sync-upstream] Removing ${stale.length} stale ${UPSTREAM_REMOTE} tracking refs.`)
  execFileSync('git', ['update-ref', '--no-deref', '--stdin'], {
    cwd: repoRoot,
    input: stale.map((ref) => `delete ${ref}\n`).join(''),
    stdio: ['pipe', 'inherit', 'inherit']
  })
}

function conflictedFiles() {
  const output = git('diff', '--name-only', '--diff-filter=U')
  return output ? output.split('\n') : []
}

function stoppedCommitSubject() {
  try {
    return git('log', '-1', '--format=%s', 'REBASE_HEAD')
  } catch {
    return null
  }
}

function previewConflictCommits(currentBase) {
  try {
    return previewRebaseConflicts({
      cwd: repoRoot,
      base: currentBase,
      branch: CUSTOM_BRANCH,
      onto: targetTag
    })
  } catch (error) {
    console.log(`[sync-upstream] Could not preview the other conflicts: ${error.message}`)
    return null
  }
}

function rebaseInProgress() {
  return existsSync(path.resolve(repoRoot, git('rev-parse', '--git-path', 'rebase-merge')))
}

function rebaseOnto(currentBase) {
  const ownCommits = git('log', '--oneline', `${currentBase}..HEAD`)
  const baseLabel = git('describe', '--tags', '--always', currentBase)
  console.log(
    `\n[sync-upstream] Moving these commits from ${baseLabel} to ${targetTag}:\n${ownCommits}`
  )
  const backupBranch = `backup/${CUSTOM_BRANCH}-before-${targetTag}`
  run('git', ['branch', '-f', backupBranch, 'HEAD'])
  console.log(`[sync-upstream] Backup saved as ${backupBranch}.`)
  // Why only one: a new sync means the previous backup's version proved stable.
  const olderBackups = git(
    'for-each-ref',
    '--format=%(refname:short)',
    `refs/heads/backup/${CUSTOM_BRANCH}-before-*`
  )
    .split('\n')
    .filter((branch) => branch && branch !== backupBranch)
  for (const branch of olderBackups) {
    run('git', ['branch', '-D', branch])
  }

  let rebased = succeeds('git', [
    ...RERERE,
    'rebase',
    '--onto',
    targetTag,
    currentBase,
    CUSTOM_BRANCH
  ])
  // A stop rerere fully resolved (nothing left unmerged) only needs --continue; bounded per commit.
  let stopsLeft = ownCommits.split('\n').length
  let unresolvedReason = null
  let failedContinueAt = null
  while (!rebased && stopsLeft > 0 && rebaseInProgress()) {
    stopsLeft -= 1
    const stop = git('rev-parse', 'REBASE_HEAD')
    const files = conflictedFiles()
    if (files.length === 0 && stop === failedContinueAt) {
      unresolvedReason = 'git rebase --continue 在沒有衝突檔的情況下仍失敗'
      break
    }
    if (files.length > 0) {
      // Why app mode only: run by hand, the script stops so whoever runs it resolves the conflict.
      if (!eventsMode) {
        break
      }
      stage('resolve')
      const resolution = resolveConflictsWithClaude({ cwd: repoRoot, files, onto: targetTag })
      if (!resolution.ok) {
        unresolvedReason = resolution.reason
        break
      }
      notes.push(`解衝突「${stoppedCommitSubject()}」\n${resolution.summary}`)
    }
    rebased = succeeds('git', [...RERERE, 'rebase', '--continue'], {
      ...process.env,
      GIT_EDITOR: 'true'
    })
    failedContinueAt = rebased ? null : stop
  }
  if (!rebased) {
    if (eventsMode) {
      const files = conflictedFiles()
      const commitSubject = stoppedCommitSubject()
      execFileSync('git', ['rebase', '--abort'], { cwd: repoRoot, stdio: 'inherit' })
      const conflictCommits = previewConflictCommits(currentBase)
      emit({
        type: 'conflict',
        worktree: repoRoot,
        base: currentBase,
        files,
        commitSubject,
        ...(unresolvedReason ? { reason: unresolvedReason } : {}),
        ...(conflictCommits ? { conflictCommits } : {})
      })
      progress?.finish('failed')
      process.exit(CONFLICT_EXIT_CODE)
    }
    fail(
      [
        'Rebase stopped on a conflict. Resolve the files, then:',
        '  git add <files> && git rebase --continue',
        `Then re-run this script with ${targetTag} (same flags) to verify, push, and build.`,
        `To give up: git rebase --abort (the branch returns to ${backupBranch}'s state).`
      ].join('\n')
    )
  }
}

/** Returns null when `pnpm tc` passes, otherwise its output. */
function typecheck() {
  console.log('\n$ pnpm tc')
  const result = spawnSync('pnpm', ['tc'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  console.log(output)
  return result.status === 0 ? null : output
}

/** App mode hands errors upstream caused to Claude and commits its fix once the typecheck passes. */
function verifyTypecheck(base) {
  const errors = typecheck()
  if (errors === null) {
    return
  }
  if (!eventsMode) {
    fail('pnpm tc failed.')
  }
  stage('repair')
  const repair = repairTypecheckWithClaude({ cwd: repoRoot, onto: targetTag, base, output: errors })
  if (!repair.ok) {
    fail(`型別檢查失敗，交給 Claude Code 修正也失敗：${repair.reason}。`)
  }
  if (typecheck() !== null) {
    fail('型別檢查失敗，Claude Code 修正後仍有錯誤。')
  }
  if (git('status', '--porcelain')) {
    run('git', ['add', '-A'])
    // Why --no-verify: rebase-resolved commits skip hooks too; the typecheck above is this one's gate.
    run('git', [
      'commit',
      '--no-verify',
      '-m',
      `fix: 同步上游 ${targetTag} 後修正型別錯誤`,
      ...(repair.summary ? ['-m', repair.summary] : [])
    ])
  }
  notes.push(`修正型別錯誤\n${repair.summary}`)
}

function writeSummary() {
  const file = path.resolve(repoRoot, git('rev-parse', '--git-path', 'orca-sync-summary.md'))
  if (writeSyncSummary({ file, targetTag, notes })) {
    console.log(`[sync-upstream] Summary saved to ${file}`)
  }
}

if (!targetTag || !RELEASE_TAG.test(targetTag)) {
  fail(
    'Usage: sync-upstream.mjs <release tag, e.g. v1.4.221> [--push] [--build] [--auto-worktree] [--events]'
  )
}
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== CUSTOM_BRANCH) {
  if (autoWorktree) {
    delegateToCustomBranchWorktree()
  }
  fail(`Switch to ${CUSTOM_BRANCH} first (git switch ${CUSTOM_BRANCH}).`)
}
if (git('status', '--porcelain')) {
  fail(`${repoRoot} has uncommitted changes on ${CUSTOM_BRANCH}. Commit or stash them first.`)
}

const progressGitDir = gitCommonDir(repoRoot)
const syncStartedAt = Date.now()
progress = createProgressReporter({
  gitDir: progressGitDir,
  phase: 'sync',
  steps: SYNC_STEPS,
  laterMs: shouldBuild ? estimatedBuildMs(progressGitDir) : 0,
  startedAt: syncStartedAt
})

stage('fetch')
dropStaleUpstreamRefs()
// Why an explicit refspec: upstream has 10k+ branches (pr-assets etc.) that grew .git by GBs.
run('git', [
  'fetch',
  UPSTREAM_REMOTE,
  '--tags',
  '--prune',
  `+refs/heads/main:refs/remotes/${UPSTREAM_REMOTE}/main`
])
try {
  git('rev-parse', '--verify', '--quiet', `refs/tags/${targetTag}`)
} catch {
  fail(`Tag ${targetTag} does not exist on ${UPSTREAM_REMOTE}.`)
}

const plan = resolveRebaseBase({
  cwd: repoRoot,
  branch: 'HEAD',
  targetTag,
  upstreamMain: `${UPSTREAM_REMOTE}/main`
})
if (plan.kind === 'target-predates-fork') {
  fail(
    `${targetTag} predates ${git('describe', '--tags', '--always', plan.forkPoint)}, the upstream commit ${CUSTOM_BRANCH} builds on. Pick a newer tag.`
  )
}
const startHead = git('rev-parse', 'HEAD')
if (plan.kind === 'already-based') {
  console.log(`\n[sync-upstream] Already based on ${targetTag}; verifying only.`)
} else {
  stage('rebase')
  rebaseOnto(plan.base)
}
// Why app mode only: run by hand, a failed step leaves the branch as-is for whoever runs it to fix.
if (eventsMode) {
  rollbackTo = startHead
}

stage('install')
run('pnpm', ['install', '--frozen-lockfile'])
// zh-TW.json is derived from upstream's zh.json, so refresh it after every rebase.
run('node', [path.join('config', 'scripts', 'fork-maintenance', 'generate-zh-tw-locale.mjs')])
if (git('status', '--porcelain', '--', ZH_TW_CATALOG)) {
  run('git', ['commit', '-m', 'chore: 依上游 zh.json 重新產生繁體中文翻譯', '--', ZH_TW_CATALOG])
}
stage('verify')
verifyTypecheck(plan.base)
rollbackTo = null
writeSummary()

if (shouldPush) {
  stage('push')
  run('git', ['push', '--force-with-lease', FORK_REMOTE, CUSTOM_BRANCH])
  run('git', ['fetch', UPSTREAM_REMOTE, 'main'])
  run('git', ['push', FORK_REMOTE, `${UPSTREAM_REMOTE}/main:main`])
}

if (shouldBuild) {
  stage('build')
  // Why: the build reports its own steps; it keeps this run's start so the bar doesn't reset.
  progress.saveTimings()
  process.env[STARTED_AT_ENV] = String(syncStartedAt)
  run('node', [path.join('config', 'scripts', 'fork-maintenance', 'build-mac-local-arm64.mjs')])
  emit({
    type: 'done',
    manifestPath: path.join(repoRoot, 'dist', 'latest-mac.yml')
  })
}

if (!shouldBuild) {
  progress.finish('done')
}
console.log(`\n[sync-upstream] ${CUSTOM_BRANCH} is now based on ${targetTag}.`)
if (!shouldPush) {
  console.log(
    `Push when ready: git push --force-with-lease ${FORK_REMOTE} ${CUSTOM_BRANCH} && git push ${FORK_REMOTE} ${UPSTREAM_REMOTE}/main:main`
  )
}
