import { useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  Columns2,
  Loader2,
  Settings2,
  SquareTerminal,
  TerminalSquare,
  Unplug
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ServerProfileSummary } from '../../../../shared/server-files-types'
import { CommandTemplateDialog, type TemplateRequest } from './CommandTemplateDialog'
import { PaneActionButton } from './PaneActionButton'
import { RemotePane } from './RemotePane'
import { errorReason } from './server-files-messages'
import {
  connectServer,
  disconnectServer,
  projectForPath,
  setSplitView
} from './server-files-navigation'
import { emptyWorkspace, useServerFilesStore } from './server-files-store'
import { TransfersPanel } from './TransfersPanel'
import { usePaneActions } from './use-pane-actions'
import { createNonSecureContextUuid as createBrowserUuid } from '../../../../shared/non-secure-context-uuid'

export function serverEndpointText(profile: ServerProfileSummary): string {
  const { endpoint } = profile
  if (endpoint.kind === 'ssh-config') {
    return translate('auto.components.serverFiles.workspace.alias', 'ssh-config: {{value0}}', {
      value0: endpoint.alias
    })
  }
  const user = endpoint.username ? `${endpoint.username}@` : ''
  return `${user}${endpoint.host}${endpoint.port === 22 ? '' : `:${endpoint.port}`}`
}

function SessionLine({ serverId }: { serverId: string }): React.JSX.Element | null {
  const session = useServerFilesStore((s) => s.sessions[serverId])
  if (!session) {
    return null
  }
  if (session.status === 'connecting') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {translate('auto.components.serverFiles.workspace.connecting', 'Connecting…')}
      </span>
    )
  }
  if (session.status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <span className="size-2 rounded-full bg-destructive" />
        {errorReason(session.error.code)}
      </span>
    )
  }
  const identity = session.info.identity
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-full bg-status-success" />
      {identity
        ? translate('auto.components.serverFiles.workspace.signedInAs', 'Signed in as {{value0}}', {
            value0: identity.userName
          })
        : translate('auto.components.serverFiles.workspace.connected', 'Connected')}
    </span>
  )
}

export function ServerWorkspace(props: {
  profile: ServerProfileSummary
  onEditProfile: (tab?: 'templates') => void
}): React.JSX.Element {
  const { profile, onEditProfile } = props
  const serverId = profile.id
  const workspace = useServerFilesStore((s) => s.workspaces[serverId]) ?? emptyWorkspace()
  const session = useServerFilesStore((s) => s.sessions[serverId])
  const [template, setTemplate] = useState<TemplateRequest | null>(null)
  const active = workspace.split ? workspace.activePane : 0
  const { actions } = usePaneActions(serverId, active)
  const activePath = workspace.panes[active].path
  const info = session?.status === 'connected' ? session.info : null

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{profile.label}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {serverEndpointText(profile)}
          </div>
        </div>
        <SessionLine serverId={serverId} />
        <div className="ml-auto flex items-center gap-1">
          <PaneActionButton action={actions.terminal} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={!info}>
                <TerminalSquare />
                {translate('auto.components.serverFiles.workspace.templates', 'Commands')}
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {profile.commandTemplates.map((entry) => (
                <DropdownMenuItem
                  key={entry.id}
                  onSelect={() =>
                    info &&
                    setTemplate({
                      key: createBrowserUuid(),
                      serverId,
                      serverLabel: profile.label,
                      template: entry,
                      project: projectForPath(profile, activePath),
                      cwd: activePath ?? info.homePath,
                      homePath: info.homePath
                    })
                  }
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span>{entry.label}</span>
                    <span className="truncate font-mono text-2xs text-muted-foreground">
                      {entry.command}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
              {profile.commandTemplates.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onSelect={() => onEditProfile('templates')}>
                {translate(
                  'auto.components.serverFiles.workspace.manageTemplates',
                  'Manage commands…'
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Toggle
            size="sm"
            pressed={workspace.split}
            disabled={!info}
            onPressedChange={(pressed) => void setSplitView(serverId, pressed)}
            aria-label={translate('auto.components.serverFiles.workspace.split', 'Split view')}
          >
            <Columns2 />
            {translate('auto.components.serverFiles.workspace.split', 'Split view')}
          </Toggle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEditProfile()}
            aria-label={translate(
              'auto.components.serverFiles.workspace.settings',
              'Connection settings'
            )}
          >
            <Settings2 />
          </Button>
          {info ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void disconnectServer(serverId)}
              aria-label={translate(
                'auto.components.serverFiles.workspace.disconnect',
                'Disconnect'
              )}
            >
              <Unplug />
            </Button>
          ) : null}
        </div>
      </div>
      {session?.status === 'error' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
          <AlertCircle className="size-5 text-destructive" />
          <p>{errorReason(session.error.code)}</p>
          <p className="max-w-lg font-mono text-xs text-muted-foreground break-all">
            {session.error.message}
          </p>
          <Button variant="outline" size="sm" onClick={() => void connectServer(serverId)}>
            {translate('auto.components.serverFiles.pane.retry', 'Try again')}
          </Button>
        </div>
      ) : !info ? (
        <div className="flex flex-1 items-center justify-center">
          {session ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <Button variant="outline" size="sm" onClick={() => void connectServer(serverId)}>
              <SquareTerminal />
              {translate('auto.components.serverFiles.workspace.connect', 'Connect')}
            </Button>
          )}
        </div>
      ) : (
        <div className={cn('flex min-h-0 flex-1', workspace.split && 'divide-x divide-border')}>
          <RemotePane serverId={serverId} index={0} />
          {workspace.split ? <RemotePane serverId={serverId} index={1} /> : null}
        </div>
      )}
      <TransfersPanel serverId={serverId} />
      <CommandTemplateDialog request={template} onClose={() => setTemplate(null)} />
    </div>
  )
}
