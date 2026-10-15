import { app, BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { UpdateStatus } from '../shared/update-status-types'
import { spawnProcess } from '../shared/child-process/run-process'
import { AUTO_UPDATE_CHECK_INTERVAL_MS } from './updater/updater-state'
import { installForkBuild } from './fork-update-install'

type ForkSource = {
  repoRoot: string
  branch: string
  baseTag: string
  upstreamRemote: string
  forkRemote: string
}

let cachedForkSource: ForkSource | null | undefined = undefined

export function getForkSource(): ForkSource | null {
  if (cachedForkSource !== undefined) {
    return cachedForkSource
  }
  let result: ForkSource | null
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    result = pkg.orcaForkSource ?? null
  } catch {
    result = null
  }
  cachedForkSource = result
  return result
}

export function isForkBuild(): boolean {
  return getForkSource() !== null
}

let forkStatus: UpdateStatus = { state: 'idle' }

/** Fork builds answer `updater:getStatus` from here; electron-updater never runs for them. */
export function getForkUpdateStatus(): UpdateStatus {
  return forkStatus
}

function broadcastStatus(status: UpdateStatus): void {
  forkStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:status', status)
    }
  }
}

let latestUpstreamTag: string | null = null

export function checkForkUpdate(userInitiated = true): void {
  const fork = getForkSource()
  // Why: a running sync or a finished build owns the card until it is installed.
  if (!fork || ['checking', 'downloading', 'downloaded'].includes(forkStatus.state)) {
    return
  }
  broadcastStatus({ state: 'checking', userInitiated })

  const child = spawnProcess({
    program: 'git',
    args: ['ls-remote', '--tags', '--sort=-v:refname', fork.upstreamRemote],
    cwd: fork.repoRoot
  })

  let stdout = ''
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })
  child.stderr.on('data', () => {})
  child.on('error', () => {
    broadcastStatus({ state: 'error', message: '無法執行 git 檢查上游版本', userInitiated })
  })

  child.on('close', (code) => {
    if (code !== 0) {
      broadcastStatus({ state: 'error', message: '無法連線到上游倉庫', userInitiated })
      return
    }
    const tags = stdout
      .split('\n')
      .map((line) => line.replace(/.*refs\/tags\//, '').trim())
      .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
      .sort((a, b) => compareVersions(b, a))

    if (tags.length === 0) {
      broadcastStatus({ state: 'not-available', userInitiated })
      return
    }

    const newest = tags[0]
    if (compareVersions(newest, fork.baseTag) <= 0) {
      broadcastStatus({ state: 'not-available', userInitiated })
      return
    }

    latestUpstreamTag = newest
    broadcastStatus({
      state: 'available',
      version: newest,
      changelog: {
        release: {
          title: `上游更新 ${newest}`,
          description: `從 ${fork.baseTag} 更新到 ${newest}，將重新 rebase 自訂 commits 並本地重建。`,
          releaseNotesUrl: `https://github.com/stablyai/orca/releases/tag/${newest}`
        },
        releasesBehind: null
      }
    })
  })
}

/** Fork builds skip electron-updater's release feed; upstream tags are their only update source. */
export function startForkUpdateChecks(): void {
  checkForkUpdate(false)
  setInterval(() => checkForkUpdate(false), AUTO_UPDATE_CHECK_INTERVAL_MS).unref()
}

export function syncAndBuild(): void {
  const fork = getForkSource()
  const version = latestUpstreamTag
  if (!fork || !version || forkStatus.state === 'downloading') {
    return
  }

  broadcastStatus({ state: 'downloading', percent: 0, version })

  const scriptPath = path.join(
    fork.repoRoot,
    'config',
    'scripts',
    'fork-maintenance',
    'sync-upstream.mjs'
  )

  const child = spawnProcess({
    program: process.execPath,
    args: [scriptPath, version, '--build', '--events'],
    cwd: fork.repoRoot,
    // Why: process.execPath is Orca itself; without this it starts a second app instance, which
    // exits on the single-instance lock, instead of running the script.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  const stages: Record<string, number> = {
    fetch: 5,
    rebase: 20,
    resolve: 25,
    install: 35,
    verify: 50,
    repair: 55,
    build: 60
  }

  let built = false
  let lastLine = ''
  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    lastLine += text
    const lines = lastLine.split('\n')
    lastLine = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('ORCA_SYNC_EVENT ')) {
        continue
      }
      try {
        const event = JSON.parse(line.slice('ORCA_SYNC_EVENT '.length))
        if (event.type === 'stage' && stages[event.stage] !== undefined) {
          broadcastStatus({
            state: 'downloading',
            percent: stages[event.stage],
            version
          })
        } else if (event.type === 'conflict') {
          const files = Array.isArray(event.files) ? event.files.join(', ') : ''
          const reason = typeof event.reason === 'string' ? `${event.reason}。` : ''
          broadcastStatus({
            state: 'error',
            message: `Rebase 衝突：${event.commitSubject ?? ''}。衝突檔案：${files}。${reason}請手動解決後重試。`,
            version,
            userInitiated: true
          })
        } else if (event.type === 'done') {
          built = true
          const notes = typeof event.summary === 'string' ? event.summary.trim() : ''
          broadcastStatus({
            state: 'downloaded',
            version,
            ...(notes ? { notes } : {})
          })
        }
      } catch {
        // non-event line
      }
    }
  })

  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  child.on('error', (error) => {
    broadcastStatus({ state: 'error', message: `無法啟動同步腳本：${error.message}`, version })
  })

  child.on('close', (code) => {
    if (code === 2) {
      // conflict exit — event already emitted above
      return
    }
    if (code !== 0) {
      broadcastStatus({
        state: 'error',
        message: `同步建置失敗 (exit ${code})：${stderr.slice(-200)}`,
        version,
        userInitiated: true
      })
      return
    }
    // Why: exit 0 without the build's done event means nothing was built to install.
    if (!built) {
      broadcastStatus({
        state: 'error',
        message: '同步腳本結束但沒有產生新的建置',
        version,
        userInitiated: true
      })
    }
  })
}

export function installForkUpdate(): void {
  const fork = getForkSource()
  if (!fork) {
    return
  }
  installForkBuild(fork.repoRoot, (message) =>
    broadcastStatus({ state: 'error', message, userInitiated: true })
  )
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) {
      return (pa[i] ?? 0) - (pb[i] ?? 0)
    }
  }
  return 0
}
