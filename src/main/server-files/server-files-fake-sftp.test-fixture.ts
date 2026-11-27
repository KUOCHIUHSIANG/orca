import { readFileSync, writeFileSync } from 'node:fs'
import type { FileEntryWithStats, Stats, TransferOptions } from 'ssh2'
import {
  joinRemotePath,
  normalizeRemotePath,
  remoteBaseName,
  remoteParentPath
} from '../../shared/server-files-paths'
import type { ServerSftp } from './server-files-sftp'

type FakeNode = {
  kind: 'file' | 'directory' | 'symlink'
  mode: number
  uid: number
  gid: number
  mtime: number
  content: Buffer
  target?: string
}

type Done = (err?: Error | null) => void

const TYPE_BITS = { file: 0o100000, directory: 0o040000, symlink: 0o120000 }

function statusError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code })
}

const noSuchFile = (path: string): Error => statusError(2, `No such file: ${path}`)
const denied = (path: string): Error => statusError(3, `Permission denied: ${path}`)
const failure = (path: string): Error => statusError(4, `Failure: ${path}`)

/** In-memory SFTP server for tests. It does not enforce mode bits; `denyWrites` simulates refusals. */
export class FakeSftp implements ServerSftp {
  readonly nodes = new Map<string, FakeNode>()
  readonly denyWrites = new Set<string>()
  freeBytes = 10 * 1024 * 1024
  readOnly = false
  ended = false

  constructor() {
    this.nodes.set('/', this.node('directory', 0o755))
  }

  private node(kind: FakeNode['kind'], mode: number, uid = 1000, gid = 1000): FakeNode {
    return {
      kind,
      mode: TYPE_BITS[kind] | mode,
      uid,
      gid,
      mtime: 1_700_000_000,
      content: Buffer.alloc(0)
    }
  }

  addDir(path: string, options: { mode?: number; uid?: number; gid?: number } = {}): this {
    this.nodes.set(path, this.node('directory', options.mode ?? 0o755, options.uid, options.gid))
    return this
  }

  addFile(
    path: string,
    content: string,
    options: { mode?: number; uid?: number; gid?: number; mtime?: number } = {}
  ): this {
    const node = this.node('file', options.mode ?? 0o644, options.uid, options.gid)
    node.content = Buffer.from(content)
    node.mtime = options.mtime ?? node.mtime
    this.nodes.set(path, node)
    return this
  }

  addLink(path: string, target: string): this {
    const node = this.node('symlink', 0o777)
    node.target = target
    this.nodes.set(path, node)
    return this
  }

  private resolve(path: string, followLast: boolean, depth = 0): string {
    if (depth > 20) {
      throw statusError(4, 'Too many links')
    }
    const normalized = normalizeRemotePath(path) ?? path
    if (normalized === '/') {
      return '/'
    }
    const parent = this.resolve(remoteParentPath(normalized), true, depth + 1)
    const candidate = joinRemotePath(parent, remoteBaseName(normalized))
    const node = this.nodes.get(candidate)
    if (followLast && node?.kind === 'symlink' && node.target) {
      return this.resolve(node.target, true, depth + 1)
    }
    return candidate
  }

  private statsOf(node: FakeNode): Stats {
    return {
      mode: node.mode,
      uid: node.uid,
      gid: node.gid,
      size: node.content.length,
      atime: node.mtime,
      mtime: node.mtime,
      isDirectory: () => node.kind === 'directory',
      isFile: () => node.kind === 'file',
      isSymbolicLink: () => node.kind === 'symlink',
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false
    }
  }

  private lookup(path: string, follow: boolean): FakeNode {
    const node = this.nodes.get(this.resolve(path, follow))
    if (!node) {
      throw noSuchFile(path)
    }
    return node
  }

  private writable(path: string): void {
    const resolved = this.resolve(path, false)
    if (this.denyWrites.has(resolved) || this.denyWrites.has(remoteParentPath(resolved))) {
      throw denied(path)
    }
    if (this.readOnly) {
      throw failure(path)
    }
  }

  private attempt(callback: Done, run: () => void): void {
    try {
      run()
      callback()
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)))
    }
  }

  readdir(path: string, callback: (err: Error | undefined, list: FileEntryWithStats[]) => void) {
    try {
      const dir = this.resolve(path, true)
      if (this.lookup(dir, false).kind !== 'directory') {
        throw failure(path)
      }
      const list = [...this.nodes.entries()]
        .filter(([child]) => child !== dir && remoteParentPath(child) === dir)
        .map(([child, node]) => ({
          filename: remoteBaseName(child),
          longname: `${node.kind === 'directory' ? 'd' : '-'}rwxr-xr-x 1 user${node.uid} group${node.gid} ${node.content.length} Jan 1 00:00 ${remoteBaseName(child)}`,
          attrs: this.statsOf(node)
        }))
      callback(undefined, list)
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)), [])
    }
  }

  stat(path: string, callback: (err: Error | undefined, stats: Stats) => void): void {
    try {
      callback(undefined, this.statsOf(this.lookup(path, true)))
    } catch (error) {
      callback(error instanceof Error ? error : undefined, this.statsOf(this.node('file', 0)))
    }
  }

  lstat(path: string, callback: (err: Error | undefined, stats: Stats) => void): void {
    try {
      callback(undefined, this.statsOf(this.lookup(path, false)))
    } catch (error) {
      callback(error instanceof Error ? error : undefined, this.statsOf(this.node('file', 0)))
    }
  }

  realpath(path: string, callback: (err: Error | undefined, absPath: string) => void): void {
    try {
      const resolved = this.resolve(path === '.' ? '/home/user' : path, true)
      this.lookup(resolved, false)
      callback(undefined, resolved)
    } catch (error) {
      callback(error instanceof Error ? error : undefined, '')
    }
  }

  mkdir(path: string, callback: Done): void {
    this.attempt(callback, () => {
      this.writable(path)
      if (this.nodes.has(this.resolve(path, false))) {
        throw failure(path)
      }
      this.nodes.set(this.resolve(path, false), this.node('directory', 0o755))
    })
  }

  rmdir(path: string, callback: Done): void {
    this.attempt(callback, () => {
      this.writable(path)
      const resolved = this.resolve(path, false)
      if (
        [...this.nodes.keys()].some((key) => remoteParentPath(key) === resolved && key !== resolved)
      ) {
        throw failure(path)
      }
      this.lookup(resolved, false)
      this.nodes.delete(resolved)
    })
  }

  unlink(path: string, callback: Done): void {
    this.attempt(callback, () => {
      this.writable(path)
      const resolved = this.resolve(path, false)
      this.lookup(resolved, false)
      this.nodes.delete(resolved)
    })
  }

  rename(from: string, to: string, callback: Done): void {
    this.attempt(callback, () => {
      this.writable(from)
      const source = this.resolve(from, false)
      const node = this.lookup(source, false)
      this.nodes.delete(source)
      this.nodes.set(this.resolve(to, false), node)
    })
  }

  utimes(path: string, _atime: number, mtime: number, callback: Done): void {
    this.attempt(callback, () => {
      this.lookup(path, true).mtime = mtime
    })
  }

  fastPut(localPath: string, remotePath: string, options: TransferOptions, callback: Done): void {
    this.attempt(callback, () => {
      if (this.ended) {
        throw statusError(7, 'Channel closed')
      }
      const resolved = this.resolve(remotePath, true)
      if (this.denyWrites.has(resolved) || this.denyWrites.has(remoteParentPath(resolved))) {
        throw denied(remotePath)
      }
      const content = readFileSync(localPath)
      if (content.length > this.freeBytes) {
        throw failure(remotePath)
      }
      const existing = this.nodes.get(resolved)
      const node = existing ?? this.node('file', 0o644)
      node.content = content
      node.mtime = Math.floor(Date.now() / 1000)
      this.nodes.set(resolved, node)
      options.step?.(content.length, content.length, content.length)
    })
  }

  fastGet(remotePath: string, localPath: string, options: TransferOptions, callback: Done): void {
    this.attempt(callback, () => {
      const node = this.lookup(remotePath, true)
      writeFileSync(localPath, node.content)
      options.step?.(node.content.length, node.content.length, node.content.length)
    })
  }

  ext_openssh_statvfs(_path: string, callback: (err: Error | undefined, info: unknown) => void) {
    callback(undefined, {
      f_bavail: Math.floor(this.freeBytes / 4096),
      f_frsize: 4096,
      f_flag: this.readOnly ? 1 : 0
    })
  }

  end(): void {
    this.ended = true
  }
}
