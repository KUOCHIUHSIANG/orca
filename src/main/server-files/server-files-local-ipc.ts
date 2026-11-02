import { app, dialog, shell, type OpenDialogOptions } from 'electron'
import { getCurrentMainWindow } from '../ipc/ssh/ssh-ipc-context'
import { handleServerFiles } from './server-files-ipc-handle'
import { LocalPathOnlySchema, NoArgsSchema, PickLocalSchema } from './server-files-schemas'

const PICKER_PROPERTIES: Record<'files' | 'folders' | 'folder', OpenDialogOptions['properties']> = {
  files: ['openFile', 'multiSelections'],
  folders: ['openDirectory', 'multiSelections'],
  folder: ['openDirectory', 'createDirectory']
}

export function registerServerFilesLocalHandlers(): void {
  handleServerFiles('serverFiles:pickLocal', PickLocalSchema, async ({ kind, defaultPath }) => {
    const options: OpenDialogOptions = {
      properties: PICKER_PROPERTIES[kind],
      ...(defaultPath ? { defaultPath } : {})
    }
    const win = getCurrentMainWindow()
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })
  handleServerFiles('serverFiles:localDefaults', NoArgsSchema, async () => ({
    downloadsDir: app.getPath('downloads')
  }))
  handleServerFiles('serverFiles:showInFolder', LocalPathOnlySchema, async ({ path }) => {
    shell.showItemInFolder(path)
  })
}
