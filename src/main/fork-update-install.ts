import { app } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnProcess } from '@orca/process-host'

// Why staging + mv: a failed copy must never leave the installed app already deleted.
const SWAP_SCRIPT = 'rm -rf "$3" && cp -R "$1" "$3" && rm -rf "$2" && mv "$3" "$2"'

/** Replaces the running app bundle with the fork's fresh local build, then relaunches into it. */
export function installForkBuild(repoRoot: string, onError: (message: string) => void): void {
  const builtApp = path.join(repoRoot, 'dist', 'mac-arm64', 'Orca.app')
  const installedApp = path.dirname(app.getPath('exe')).replace(/\/Contents\/.*$/, '')
  if (!existsSync(builtApp)) {
    onError(`找不到建置好的 app：${builtApp}`)
    return
  }
  if (!installedApp.endsWith('.app')) {
    onError(`無法判斷目前安裝的 app 位置：${installedApp}`)
    return
  }

  const child = spawnProcess({
    program: '/bin/bash',
    args: [
      '-c',
      SWAP_SCRIPT,
      'orca-fork-install',
      builtApp,
      installedApp,
      `${installedApp}.updating`
    ]
  })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  child.on('error', (error) => onError(`安裝失敗：${error.message}`))
  child.on('close', (code) => {
    if (code !== 0) {
      onError(
        `安裝失敗 (exit ${code})：${stderr.slice(-200)}。可手動將 ${builtApp} 複製到 ${installedApp}。`
      )
      return
    }
    // Why: relaunch starts the new bundle only after this instance exits and frees the single-instance lock.
    app.relaunch()
    app.quit()
  })
}
