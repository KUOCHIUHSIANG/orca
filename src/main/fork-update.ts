import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import type { UpdateStatus } from '../shared/update-status-types'
import { spawnProcess } from '../shared/child-process/run-process'

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
    const pkg = JSON.parse(require('node:fs').readFileSync(pkgPath, 'utf8'))
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

function broadcastStatus(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:status', status)
    }
  }
}

let latestUpstreamTag: string | null = null

export function checkForkUpdate(): void {
  const fork = getForkSource()
  if (!fork) {
    return
  }
  broadcastStatus({ state: 'checking', userInitiated: true })

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

  child.on('close', (code) => {
    if (code !== 0) {
      broadcastStatus({ state: 'error', message: '無法連線到上游倉庫', userInitiated: true })
      return
    }
    const tags = stdout
      .split('\n')
      .map((line) => line.replace(/.*refs\/tags\//, '').trim())
      .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
      .sort((a, b) => compareVersions(b, a))

    if (tags.length === 0) {
      broadcastStatus({ state: 'not-available', userInitiated: true })
      return
    }

    const newest = tags[0]
    if (compareVersions(newest, fork.baseTag) <= 0) {
      broadcastStatus({ state: 'not-available', userInitiated: true })
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

export function syncAndBuild(): void {
  const fork = getForkSource()
  if (!fork || !latestUpstreamTag) {
    return
  }

  broadcastStatus({
    state: 'downloading',
    percent: 0,
    version: latestUpstreamTag
  })

  const scriptPath = path.join(
    fork.repoRoot,
    'config',
    'scripts',
    'fork-maintenance',
    'sync-upstream.mjs'
  )

  const child = spawnProcess({
    program: process.execPath,
    args: [scriptPath, latestUpstreamTag, '--build', '--events'],
    cwd: fork.repoRoot
  })
  const stages: Record<string, number> = {
    fetch: 5,
    rebase: 20,
    install: 35,
    verify: 50,
    build: 60
  }

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
            version: latestUpstreamTag!
          })
        } else if (event.type === 'conflict') {
          const files = Array.isArray(event.files) ? event.files.join(', ') : ''
          broadcastStatus({
            state: 'error',
            message: `Rebase 衝突：${event.commitSubject ?? ''}。衝突檔案：${files}。請手動解決後重試。`,
            version: latestUpstreamTag!,
            userInitiated: true
          })
        } else if (event.type === 'done') {
          broadcastStatus({
            state: 'downloaded',
            version: latestUpstreamTag!
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

  child.on('close', (code) => {
    if (code === 2) {
      // conflict exit — event already emitted above
      return
    }
    if (code !== 0) {
      broadcastStatus({
        state: 'error',
        message: `同步建置失敗 (exit ${code})：${stderr.slice(-200)}`,
        version: latestUpstreamTag!,
        userInitiated: true
      })
      return
    }
    broadcastStatus({
      state: 'downloaded',
      version: latestUpstreamTag!
    })
  })
}

export function installForkUpdate(): void {
  const fork = getForkSource()
  if (!fork) {
    return
  }
  const appPath = path.join(fork.repoRoot, 'dist', 'mac-arm64', 'Orca.app')
  const installedPath = path.dirname(app.getPath('exe')).replace(/\/Contents\/.*$/, '')

  const child = spawnProcess({
    program: '/bin/bash',
    args: [
      '-c',
      `rm -rf "${installedPath}" && cp -R "${appPath}" "${installedPath}" && open -n "${installedPath}"`
    ]
  })

  child.on('close', (code) => {
    if (code === 0) {
      app.quit()
    } else {
      broadcastStatus({
        state: 'error',
        message: `安裝失敗 (exit ${code})。請手動將 ${appPath} 複製到 /Applications。`,
        userInitiated: true
      })
    }
  })
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
