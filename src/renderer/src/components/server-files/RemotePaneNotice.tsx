import { Info, Lock, ShieldCheck } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { canChangeFolder, formatRemoteMode } from '../../../../shared/server-files-access'
import { findProtectedRoot } from '../../../../shared/server-files-paths'
import type { RemoteDirectoryState, ServerSessionInfo } from '../../../../shared/server-files-types'

/** Persistent, inline reasons: why actions here are off or need an extra confirmation. */
export function RemotePaneNotice(props: {
  listing: RemoteDirectoryState
  info: ServerSessionInfo
}): React.JSX.Element | null {
  const { listing, info } = props
  const protectedRoot = findProtectedRoot(listing.path, info.protectedRoots)
  const verdict = canChangeFolder(listing, info.identity)
  const lines: { icon: typeof Info; text: string }[] = []
  if (protectedRoot) {
    lines.push({
      icon: ShieldCheck,
      text: translate(
        'auto.components.serverFiles.notice.protected',
        'Protected path {{value0}}: nothing here can be deleted or renamed, and overwriting asks once more.',
        { value0: protectedRoot }
      )
    })
  }
  if (verdict.state === 'denied') {
    const node = listing.node
    const who = info.identity
      ? translate(
          'auto.components.serverFiles.notice.you',
          'you are {{value0}} (groups: {{value1}})',
          {
            value0: info.identity.userName,
            value1: info.identity.groupNames.join(', ') || info.identity.gids.join(', ')
          }
        )
      : ''
    lines.push({
      icon: Lock,
      text:
        verdict.reason === 'read-only-filesystem'
          ? translate(
              'auto.components.serverFiles.notice.readOnly',
              'This folder is on a read-only file system.'
            )
          : translate(
              'auto.components.serverFiles.notice.notWritable',
              'No write permission here: {{value0}}; {{value1}}',
              {
                value0: node
                  ? `${formatRemoteMode(node.mode)} ${node.owner} ${node.group}`
                  : listing.path,
                value1: who
              }
            )
    })
  }
  if (!info.identity) {
    lines.push({
      icon: Info,
      text: translate(
        'auto.components.serverFiles.notice.unknown',
        'This account cannot run commands, so permissions are not checked in advance; the server decides.'
      )
    })
  }
  if (lines.length === 0) {
    return null
  }
  return (
    <div className="shrink-0 space-y-0.5 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
      {lines.map(({ icon: Icon, text }) => (
        <p key={text} className="flex items-start gap-1.5">
          <Icon className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{text}</span>
        </p>
      ))}
    </div>
  )
}
