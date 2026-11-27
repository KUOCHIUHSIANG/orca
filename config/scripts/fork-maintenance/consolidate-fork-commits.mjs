#!/usr/bin/env node
// Squashes the fork's own commits on top of an upstream base into one commit per feature, so a
// sync re-stacks a handful of commits instead of every change ever made.
//
//   node consolidate-fork-commits.mjs <base>          (on the custom branch, clean tree)
//
// Each changed file goes to one feature group; the group commits are built straight from the
// branch's own files (nothing is replayed, so nothing can conflict), and the branch only moves
// when the last commit's tree is identical to where it started. The old history is kept as
// backup/custom-before-consolidate.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** The sync squashes once the fork has more of its own commits than this. */
export const CONSOLIDATE_ABOVE_COMMITS = 40

const BACKUP_BRANCH = 'backup/custom-before-consolidate'
const ZERO_SHA = '0000000000000000000000000000000000000000'
const ROUTINE_SUBJECT =
  /^(chore: 依上游 zh\.json 重新產生繁體中文翻譯|fix: 同步上游 \S+ 後修正型別錯誤)$/

// First match wins; a file no path rule claims follows the commits that touched it.
const GROUPS = [
  {
    title: 'chore: 客製功能的英文與簡中翻譯字串',
    path: /i18n\/locales\/(en|zh)\.json$/
  },
  {
    title: 'feat: 繁體中文（台灣）介面語言',
    path: /zh-tw|zh-TW|\/i18n\//,
    subject: /繁體中文|翻譯/
  },
  {
    title: 'feat: Monday 頁面、通知與任務視窗',
    path: /monday|taiwan-holiday|components\/calendar\//i,
    subject: /Monday|國定假日|行事曆/
  },
  {
    title: 'feat: Microsoft To Do 待辦',
    path: /todo|microsoft/i,
    subject: /待辦|To Do/
  },
  {
    title: 'feat: 伺服器頁面（SFTP 與終端機）',
    path: /server-files|ssh-authentication/,
    subject: /伺服器/
  },
  {
    title: 'feat: 頁面與任務面板可開成獨立視窗',
    path: /detached-page/,
    subject: /獨立視窗/
  },
  {
    title: 'build: 本機建置、重新安裝與同步上游',
    path: /fork-maintenance|fork-update|fork-build|ForkSync|ForkBuild|maintenance\/|updater/,
    subject: /建置|同步|更新|安裝|backup|refspec|upstream/i
  },
  {
    title: 'feat: Run 設定與底部執行面板',
    path: /run-configuration|bottom-panel\/run|dotnet/,
    subject: /Run|\.NET/
  },
  {
    title: 'feat: Git 工具（底部 Git 面板、Blame、變更 gutter）',
    path: /git|blame|gutter|source-control|submodule|file-explorer/i,
    subject: /Git|Blame|gutter|分支|檔案總管|submodule/
  }
]
const OTHER_TITLE = 'feat: 其他介面調整'

function gitIn(cwd, env = process.env) {
  return (args, input) =>
    execFileSync('git', args, {
      cwd,
      env,
      input,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024
    }).trimEnd()
}

/** Each commit's subject and the files it touched, oldest first. */
function readCommits(git, base, head) {
  const records = git([
    'log',
    '--reverse',
    '--no-renames',
    '--name-only',
    '--format=%x00%s',
    `${base}..${head}`
  ])
  return records
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const [subject, ...files] = record.split('\n')
      return { subject, files: files.filter(Boolean) }
    })
}

function groupForFile(file, touchingSubjects) {
  const byPath = GROUPS.find((group) => group.path.test(file))
  if (byPath) {
    return byPath.title
  }
  // Routine sync commits touch everything; they only decide when nothing else touched the file.
  const meaningful = touchingSubjects.filter((subject) => !ROUTINE_SUBJECT.test(subject))
  const votes = new Map()
  for (const subject of meaningful.length > 0 ? meaningful : touchingSubjects) {
    const group = GROUPS.find((candidate) => candidate.subject?.test(subject))
    const title = group?.title ?? OTHER_TITLE
    votes.set(title, (votes.get(title) ?? 0) + 1)
  }
  let best = OTHER_TITLE
  for (const [title, count] of votes) {
    if (count > (votes.get(best) ?? 0)) {
      best = title
    }
  }
  return best
}

function groupMessage(title, subjects) {
  const listed = [...new Set(subjects.filter((subject) => !ROUTINE_SUBJECT.test(subject)))]
  const routine = subjects.filter((subject) => ROUTINE_SUBJECT.test(subject)).length
  return [
    title,
    '',
    `整合 ${listed.length} 個 commit：`,
    ...listed.map((subject) => `- ${subject}`),
    ...(routine > 0 ? ['', `另含 ${routine} 個同步上游後的翻譯重產與型別修正。`] : [])
  ].join('\n')
}

/**
 * Returns `{ ok: true, before, after, head }` once `branch` points at the squashed history, or
 * `{ ok: false, reason }` with the branch untouched.
 */
export function consolidateForkCommits({ cwd, base, branch = 'custom' }) {
  const git = gitIn(cwd)
  const head = git(['rev-parse', `refs/heads/${branch}`])
  const headTree = git(['rev-parse', `${head}^{tree}`])
  const commits = readCommits(git, base, head)
  const subjectsByFile = new Map()
  for (const commit of commits) {
    for (const file of commit.files) {
      subjectsByFile.set(file, [...(subjectsByFile.get(file) ?? []), commit.subject])
    }
  }

  const entries = new Map()
  for (const line of git(['ls-tree', '-r', '-z', '--full-tree', head])
    .split('\0')
    .filter(Boolean)) {
    const [meta, file] = line.split('\t')
    const [mode, , sha] = meta.split(' ')
    entries.set(file, `${mode} ${sha}`)
  }
  const changed = git(['diff', '--name-only', '--no-renames', '-z', base, head])
    .split('\0')
    .filter(Boolean)
  const filesByGroup = new Map()
  for (const file of changed) {
    const title = groupForFile(file, subjectsByFile.get(file) ?? [])
    filesByGroup.set(title, [...(filesByGroup.get(title) ?? []), file])
  }
  const order = [...GROUPS.map((group) => group.title), OTHER_TITLE].filter((title) =>
    filesByGroup.has(title)
  )
  if (order.length >= commits.length) {
    return { ok: false, reason: `只有 ${commits.length} 個 commit，整理不會更少` }
  }

  const indexDir = mkdtempSync(path.join(os.tmpdir(), 'orca-consolidate-'))
  try {
    const indexGit = gitIn(cwd, { ...process.env, GIT_INDEX_FILE: path.join(indexDir, 'index') })
    indexGit(['read-tree', base])
    let parent = git(['rev-parse', `${base}^{commit}`])
    for (const title of order) {
      const files = filesByGroup.get(title)
      // A file gone from the branch is removed (mode 0); everything else takes the branch's blob.
      const info = files
        .map((file) => `${entries.get(file) ?? `0 ${ZERO_SHA}`}\t${file}\0`)
        .join('')
      indexGit(['update-index', '-z', '--index-info'], info)
      const tree = indexGit(['write-tree'])
      const subjects = commits
        .filter((commit) => commit.files.some((file) => files.includes(file)))
        .map((commit) => commit.subject)
      parent = git(['commit-tree', tree, '-p', parent, '-F', '-'], groupMessage(title, subjects))
    }
    if (git(['rev-parse', `${parent}^{tree}`]) !== headTree) {
      return { ok: false, reason: '整理後的程式碼與整理前不同，已放棄整理' }
    }
    git(['branch', '-f', BACKUP_BRANCH, head])
    // Old-value check: a branch that moved meanwhile is left alone.
    git(['update-ref', '-m', 'consolidate fork commits', `refs/heads/${branch}`, parent, head])
    return { ok: true, before: commits.length, after: order.length, head: parent }
  } finally {
    rmSync(indexDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2]
  if (!base) {
    console.error('Usage: consolidate-fork-commits.mjs <upstream base, e.g. v1.4.280>')
    process.exit(1)
  }
  const result = consolidateForkCommits({ cwd: process.cwd(), base })
  if (!result.ok) {
    console.error(`[consolidate] ${result.reason}`)
    process.exit(1)
  }
  console.log(
    `[consolidate] ${result.before} 個 commit 整理為 ${result.after} 個；舊歷史在 ${BACKUP_BRANCH}`
  )
}
