#!/usr/bin/env node
// Re-stacks this fork's own commits (custom) onto a newer upstream release tag.
//
//   node config/scripts/fork-maintenance/sync-upstream.mjs v1.4.221 [--push] [--build]
//                                                          [--auto-worktree] [--events]
//
// Steps: fetch upstream tags → back up the branch → rebase the fork's own commits onto <new> →
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
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { resolveConflictsWithClaude } from './claude-conflict-resolution.mjs'
import { previewRebaseConflicts } from './rebase-conflict-preview.mjs'
import { resolveRebaseBase } from './rebase-base.mjs'

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

function stage(name) {
  emit({ type: 'stage', stage: name })
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
    fail(`${command} ${commandArgs[0]} failed (exit ${error.status ?? error.signal}).`)
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

function fail(message) {
  console.error(`\n[sync-upstream] ${message}`)
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
  while (!rebased && stopsLeft > 0 && rebaseInProgress()) {
    stopsLeft -= 1
    const files = conflictedFiles()
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
    }
    rebased = succeeds('git', [...RERERE, 'rebase', '--continue'], {
      ...process.env,
      GIT_EDITOR: 'true'
    })
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
if (plan.kind === 'already-based') {
  console.log(`\n[sync-upstream] Already based on ${targetTag}; verifying only.`)
} else {
  stage('rebase')
  rebaseOnto(plan.base)
}

stage('install')
run('pnpm', ['install', '--frozen-lockfile'])
// zh-TW.json is derived from upstream's zh.json, so refresh it after every rebase.
run('node', [path.join('config', 'scripts', 'fork-maintenance', 'generate-zh-tw-locale.mjs')])
if (git('status', '--porcelain', '--', ZH_TW_CATALOG)) {
  run('git', ['commit', '-m', 'chore: 依上游 zh.json 重新產生繁體中文翻譯', '--', ZH_TW_CATALOG])
}
stage('verify')
run('pnpm', ['tc'])

if (shouldPush) {
  stage('push')
  run('git', ['push', '--force-with-lease', FORK_REMOTE, CUSTOM_BRANCH])
  run('git', ['fetch', UPSTREAM_REMOTE, 'main'])
  run('git', ['push', FORK_REMOTE, `${UPSTREAM_REMOTE}/main:main`])
}

if (shouldBuild) {
  stage('build')
  run('node', [path.join('config', 'scripts', 'fork-maintenance', 'build-mac-local-arm64.mjs')])
  emit({ type: 'done', manifestPath: path.join(repoRoot, 'dist', 'latest-mac.yml') })
}

console.log(`\n[sync-upstream] ${CUSTOM_BRANCH} is now based on ${targetTag}.`)
if (!shouldPush) {
  console.log(
    `Push when ready: git push --force-with-lease ${FORK_REMOTE} ${CUSTOM_BRANCH} && git push ${FORK_REMOTE} ${UPSTREAM_REMOTE}/main:main`
  )
}
