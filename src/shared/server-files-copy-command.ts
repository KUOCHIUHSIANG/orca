import { quotePosixShell } from './shell-argument-quoting'
import { remoteParentPath } from './server-files-paths'

export type ServerCopyCommandItem = {
  source: string
  destination: string
  kind: 'file' | 'directory'
}

/**
 * Copies on the server itself. Every path is single-quoted, so no character in a name is ever
 * interpreted, and `--` keeps a name starting with `-` from reading as an option.
 */
export function buildServerCopyCommand(item: ServerCopyCommandItem): string {
  if (item.kind === 'directory') {
    // `/.` copies the folder's contents, so an existing destination is merged, never nested.
    return `mkdir -p -- ${quotePosixShell(item.destination)} && cp -a -- ${quotePosixShell(`${item.source}/.`)} ${quotePosixShell(item.destination)}`
  }
  return `mkdir -p -- ${quotePosixShell(remoteParentPath(item.destination))} && cp -a -- ${quotePosixShell(item.source)} ${quotePosixShell(item.destination)}`
}

/** English error text keeps the failure mapping stable whatever the server's locale is. */
export function withStableLocale(command: string): string {
  return `LC_ALL=C; export LC_ALL; ${command}`
}
