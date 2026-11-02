import { normalizeRemotePath } from '../../shared/server-files-paths'
import type { ServerProfile, ServerSessionInfo } from '../../shared/server-files-types'
import { sftpRealpath, type ServerSftp } from './server-files-sftp'
import { fail, toServerFilesError } from './server-files-errors'
import { readSessionProbe, SESSION_PROBE_COMMAND } from './server-files-session-probe'

export type RunOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  onStderr?: (stderr: string) => void
}

/** The slice of an SSH connection the page uses: SFTP plus plain command execution. */
export type ServerFilesConnection = {
  connect(): Promise<void>
  disconnect(): Promise<void>
  usesSystemSshTransport(): boolean
  sftp(): Promise<ServerSftp>
  run(command: string, options?: RunOptions): Promise<string>
}

export type ServerFilesSessionDeps = {
  loadProfile: (serverId: string) => ServerProfile | null
  createConnection: (profile: ServerProfile) => ServerFilesConnection
  idleMs?: number
}

type Session = {
  profile: ServerProfile
  connection: ServerFilesConnection
  info: ServerSessionInfo
  browse: Promise<ServerSftp> | null
  activeJobs: number
  idleTimer: ReturnType<typeof setTimeout> | null
}

const DEFAULT_IDLE_MS = 5 * 60_000

export class ServerFilesSessions {
  private readonly sessions = new Map<string, Session>()
  private readonly opening = new Map<string, Promise<Session>>()
  private readonly idleMs: number

  constructor(private readonly deps: ServerFilesSessionDeps) {
    this.idleMs = deps.idleMs ?? DEFAULT_IDLE_MS
  }

  async open(serverId: string): Promise<ServerSessionInfo> {
    const session = await this.session(serverId)
    this.touch(serverId, session)
    return session.info
  }

  profileFor(serverId: string): ServerProfile {
    return this.sessions.get(serverId)?.profile ?? this.requireProfile(serverId)
  }

  /** Browsing shares one SFTP channel per server. */
  async withBrowse<T>(
    serverId: string,
    run: (sftp: ServerSftp, info: ServerSessionInfo) => Promise<T>
  ): Promise<T> {
    const session = await this.session(serverId)
    session.browse ??= session.connection.sftp()
    try {
      return await run(await session.browse, session.info)
    } catch (error) {
      if (toServerFilesError(error).code === 'connection') {
        await this.disconnect(serverId)
      }
      throw error
    } finally {
      this.touch(serverId, session)
    }
  }

  /** Each job gets its own channel, so cancelling it is just ending that channel. */
  async withJobChannel<T>(
    serverId: string,
    run: (
      sftp: ServerSftp,
      info: ServerSessionInfo,
      connection: ServerFilesConnection
    ) => Promise<T>
  ): Promise<T> {
    const session = await this.session(serverId)
    session.activeJobs += 1
    this.clearIdle(session)
    const sftp = await session.connection.sftp()
    try {
      return await run(sftp, session.info, session.connection)
    } catch (error) {
      if (toServerFilesError(error).code === 'connection') {
        await this.disconnect(serverId)
      }
      throw error
    } finally {
      sftp.end()
      session.activeJobs -= 1
      this.touch(serverId, session)
    }
  }

  async run(serverId: string, command: string, options?: RunOptions): Promise<string> {
    const session = await this.session(serverId)
    try {
      return await session.connection.run(command, options)
    } finally {
      this.touch(serverId, session)
    }
  }

  /** Profile edits that change how to connect drop the session; others refresh it in place. */
  async refreshProfile(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId)
    const profile = this.deps.loadProfile(serverId)
    if (!session) {
      return
    }
    const sameLogin =
      profile !== null &&
      JSON.stringify([profile.endpoint, profile.auth, profile.identityFile]) ===
        JSON.stringify([
          session.profile.endpoint,
          session.profile.auth,
          session.profile.identityFile
        ])
    if (!profile || !sameLogin || !session.browse) {
      await this.disconnect(serverId)
      return
    }
    session.profile = profile
    session.info = {
      ...session.info,
      protectedRoots: await resolveProtectedRoots(await session.browse, profile.protectedPaths)
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId)
    this.sessions.delete(serverId)
    if (!session) {
      return
    }
    this.clearIdle(session)
    await session.connection.disconnect().catch(() => undefined)
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((serverId) => this.disconnect(serverId)))
  }

  private requireProfile(serverId: string): ServerProfile {
    return this.deps.loadProfile(serverId) ?? fail('invalid', 'This server no longer exists')
  }

  private async session(serverId: string): Promise<Session> {
    const existing = this.sessions.get(serverId)
    if (existing) {
      return existing
    }
    const pending = this.opening.get(serverId)
    if (pending) {
      return pending
    }
    const opening = this.connect(serverId).finally(() => this.opening.delete(serverId))
    this.opening.set(serverId, opening)
    return opening
  }

  private async connect(serverId: string): Promise<Session> {
    const profile = this.requireProfile(serverId)
    const connection = this.deps.createConnection(profile)
    await connection.connect()
    if (connection.usesSystemSshTransport()) {
      await connection.disconnect().catch(() => undefined)
      fail(
        'unsupported-transport',
        'This server needs ProxyJump, ProxyCommand or a hardware key, which SFTP here does not support yet'
      )
    }
    try {
      const browse = connection.sftp()
      const sftp = await browse
      const [homePath, probe] = await Promise.all([
        sftpRealpath(sftp, '.'),
        connection.run(SESSION_PROBE_COMMAND, { timeoutMs: 15_000 }).catch(() => null)
      ])
      const parsed = probe === null ? null : readSessionProbe(probe)
      const info: ServerSessionInfo = {
        identity: parsed?.identity ?? null,
        homePath,
        loginShell: parsed?.loginShell ?? null,
        protectedRoots: await resolveProtectedRoots(sftp, profile.protectedPaths)
      }
      const session: Session = { profile, connection, info, browse, activeJobs: 0, idleTimer: null }
      this.sessions.set(serverId, session)
      return session
    } catch (error) {
      await connection.disconnect().catch(() => undefined)
      throw error
    }
  }

  private clearIdle(session: Session): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = null
    }
  }

  private touch(serverId: string, session: Session): void {
    this.clearIdle(session)
    if (session.activeJobs > 0 || this.sessions.get(serverId) !== session) {
      return
    }
    session.idleTimer = setTimeout(() => void this.disconnect(serverId), this.idleMs)
    session.idleTimer.unref?.()
  }
}

/** Symlinked spellings of a protected folder must be protected too. */
async function resolveProtectedRoots(
  sftp: ServerSftp,
  paths: readonly string[]
): Promise<string[]> {
  const resolved = await Promise.all(
    paths.map((path) =>
      sftpRealpath(sftp, path)
        .then((real) => normalizeRemotePath(real) ?? path)
        .catch(() => path)
    )
  )
  return [...new Set([...paths, ...resolved])]
}
