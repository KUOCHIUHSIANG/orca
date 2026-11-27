import { translate } from '@/i18n/i18n'
import type { AccessVerdict } from '../../../../shared/server-files-access'
import type {
  CopyPlan,
  RemoveBlockReason,
  ServerFilesError,
  ServerFilesErrorCode
} from '../../../../shared/server-files-types'

export function errorReason(code: ServerFilesErrorCode): string {
  switch (code) {
    case 'permission-denied':
      return translate(
        'auto.components.serverFiles.messages.permissionDenied',
        'Permission denied on the server'
      )
    case 'not-found':
      return translate('auto.components.serverFiles.messages.notFound', 'No such file or folder')
    case 'no-space':
      return translate('auto.components.serverFiles.messages.noSpace', 'Not enough disk space')
    case 'quota-exceeded':
      return translate('auto.components.serverFiles.messages.quotaExceeded', 'Disk quota exceeded')
    case 'read-only-filesystem':
      return translate(
        'auto.components.serverFiles.messages.readOnlyFilesystem',
        'The file system is read-only'
      )
    case 'already-exists':
      return translate(
        'auto.components.serverFiles.messages.alreadyExists',
        'Something with this name already exists'
      )
    case 'protected':
      return translate(
        'auto.components.serverFiles.messages.protected',
        'Blocked by a protected path'
      )
    case 'unsupported-transport':
      return translate(
        'auto.components.serverFiles.messages.unsupportedTransport',
        'This server needs ProxyJump, ProxyCommand or a hardware key, which the file panel does not support yet. The terminal still works.'
      )
    case 'commands-unavailable':
      return translate(
        'auto.components.serverFiles.messages.commandsUnavailable',
        'This account can only use SFTP, not run commands'
      )
    case 'auth-failed':
      return translate('auto.components.serverFiles.messages.authFailed', 'Sign-in failed')
    case 'connection':
      return translate(
        'auto.components.serverFiles.messages.connection',
        'Could not reach the server'
      )
    case 'cancelled':
      return translate('auto.components.serverFiles.messages.cancelled', 'Cancelled')
    case 'plan-expired':
      return translate(
        'auto.components.serverFiles.messages.planExpired',
        'This confirmation expired; start again'
      )
    case 'invalid':
      return translate(
        'auto.components.serverFiles.messages.invalid',
        'This request was not accepted'
      )
    case 'failure':
      return translate(
        'auto.components.serverFiles.messages.failure',
        'The server reported a failure'
      )
  }
}

/** One line for toasts and the transfers list: reason, then the path it happened at. */
export function errorSummary(error: ServerFilesError): string {
  return error.path
    ? translate('auto.components.serverFiles.messages.errorAt', '{{value0}}: {{value1}}', {
        value0: errorReason(error.code),
        value1: error.path
      })
    : errorReason(error.code)
}

export function denyReason(verdict: AccessVerdict): string | null {
  if (verdict.state !== 'denied') {
    return null
  }
  switch (verdict.reason) {
    case 'no-selection':
      return translate('auto.components.serverFiles.messages.noSelection', 'Select an item first')
    case 'protected':
      return translate(
        'auto.components.serverFiles.messages.denyProtected',
        '{{value0}} is under a protected path',
        {
          value0: verdict.path
        }
      )
    case 'protected-descendant':
      return translate(
        'auto.components.serverFiles.messages.denyProtectedDescendant',
        '{{value0}} contains a protected path',
        {
          value0: verdict.path
        }
      )
    case 'folder-not-writable':
      return translate(
        'auto.components.serverFiles.messages.denyFolderNotWritable',
        'You have no write permission on {{value0}}',
        {
          value0: verdict.path
        }
      )
    case 'read-only-filesystem':
      return translate(
        'auto.components.serverFiles.messages.denyReadOnly',
        '{{value0}} is on a read-only file system',
        {
          value0: verdict.path
        }
      )
    case 'sticky-not-owner':
      return translate(
        'auto.components.serverFiles.messages.denySticky',
        'This folder only lets owners delete or rename their own items ({{value0}})',
        { value0: verdict.path }
      )
    case 'not-readable':
      return translate(
        'auto.components.serverFiles.messages.denyNotReadable',
        'You have no read permission on {{value0}}',
        {
          value0: verdict.path
        }
      )
  }
}

export function removeBlockReason(reason: RemoveBlockReason): string {
  switch (reason) {
    case 'protected':
      return translate('auto.components.serverFiles.messages.blockProtected', 'Protected path')
    case 'protected-descendant':
      return translate(
        'auto.components.serverFiles.messages.blockProtectedDescendant',
        'Contains a protected path'
      )
    case 'parent-not-writable':
      return translate(
        'auto.components.serverFiles.messages.blockParent',
        'No write permission on the folder that holds it'
      )
    case 'sticky-not-owner':
      return translate(
        'auto.components.serverFiles.messages.blockSticky',
        'The folder only lets owners delete their own items'
      )
    case 'subfolder-not-writable':
      return translate(
        'auto.components.serverFiles.messages.blockSubfolder',
        'No write permission on this subfolder'
      )
  }
}

export function leftoverRefusalReason(reason: NonNullable<CopyPlan['leftoversRefusal']>): string {
  switch (reason) {
    case 'overlaps-project':
      return translate(
        'auto.components.serverFiles.messages.refuseOverlapsProject',
        'The backup folder overlaps the project folder'
      )
    case 'overlaps-protected':
      return translate(
        'auto.components.serverFiles.messages.refuseOverlapsProtected',
        'The backup folder overlaps a protected path'
      )
    case 'home-or-root':
      return translate(
        'auto.components.serverFiles.messages.refuseHome',
        'The backup folder is your home folder or above it'
      )
    case 'not-removable':
      return translate(
        'auto.components.serverFiles.messages.refuseNotRemovable',
        'Some of its contents cannot be deleted with your permissions'
      )
  }
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unit]}`
}

export function formatModified(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
