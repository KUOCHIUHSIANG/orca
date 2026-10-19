import { app, BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { UpdateStatus } from '../shared/update-status-types'
import { spawnProcess } from '@orca/process-host'
import { AUTO_UPDATE_CHECK_INTERVAL_MS } from './updater/updater-state'
import { installForkBuild } from './fork-update-install'
import { onForkBuildProgress } from './fork-build-progress'
import { fetchLatestOfficialRelease } from './fork-official-release'

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
  void fetchLatestOfficialRelease()
    .catch(() => null)
    .then((latest) => announceForkUpdate(fork, latest, userInitiated))
}

function announceForkUpdate(fork: ForkSource, latest: string | null, userInitiated: boolean): void {
  if (!latest) {
    broadcastStatus({ state: 'error', message: '無法取得官方正式版資訊', userInitiated })
    return
  }
  // Why "differs" rather than "newer": the fork follows upstream's official release even when
  // upstream re-cuts it from an older base.
  if (compareVersions(latest, fork.baseTag) === 0) {
    broadcastStatus({ state: 'not-available', userInitiated, latestUpstreamVersion: latest })
    return
  }
  latestUpstreamTag = latest
  broadcastStatus({
    state: 'available',
    version: latest,
    changelog: {
      release: {
        title: `上游更新 ${latest}`,
        description: `從 ${fork.baseTag} 更新到官方正式版 ${latest}，將重新 rebase 自訂 commits 並本地重建。`,
        releaseNotesUrl: `https://github.com/stablyai/orca/releases/tag/${latest}`
      },
      releasesBehind: null
    }
  })
}

/** Fork builds skip electron-updater's install flow; upstream's official releases are their only update source. */
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
  // Why: the scripts' progress file knows each step's expected length; the card follows it.
  const stopProgress = onForkBuildProgress((progress) => {
    if (forkStatus.state !== 'downloading' || !progress?.estimatedEndAt) {
      return
    }
    const span = progress.estimatedEndAt - progress.startedAt
    const share = span > 0 ? (Date.now() - progress.startedAt) / span : 0
    broadcastStatus({
      state: 'downloading',
      percent: Math.min(99, Math.max(1, Math.round(share * 100))),
      version
    })
  })

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
        if (event.type === 'conflict') {
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
          broadcastStatus({
            state: 'downloaded',
            version
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
    stopProgress()
    broadcastStatus({ state: 'error', message: `無法啟動同步腳本：${error.message}`, version })
  })

  child.on('close', (code) => {
    stopProgress()
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
