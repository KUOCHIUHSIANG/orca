import { ipcMain } from 'electron'
import type { z } from 'zod'
import { getCurrentMainWindow } from '../ipc/ssh/ssh-ipc-context'
import type { JobProgress, ServerFilesResult } from '../../shared/server-files-types'
import { toServerFilesError } from './server-files-errors'

/** Validated invoke handler whose failures arrive as data, so the renderer can show the reason. */
export function handleServerFiles<S extends z.ZodType, R>(
  channel: string,
  schema: S,
  run: (args: z.infer<S>) => Promise<R>
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_event, raw: unknown): Promise<ServerFilesResult<R>> => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'invalid', message: parsed.error.message } }
    }
    try {
      return { ok: true, value: await run(parsed.data) }
    } catch (error) {
      return { ok: false, error: toServerFilesError(error) }
    }
  })
}

export function emitServerFilesProgress(progress: JobProgress): void {
  const win = getCurrentMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('serverFiles:progress', progress)
  }
}
