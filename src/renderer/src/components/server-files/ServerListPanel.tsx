import { Plus, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useServerFilesStore, type ServerSessionState } from './server-files-store'
import { serverEndpointText } from './ServerWorkspace'

function statusDot(session: ServerSessionState | undefined): string {
  switch (session?.status) {
    case 'connected':
      return 'bg-status-success'
    case 'connecting':
      return 'bg-status-warning'
    case 'error':
      return 'bg-destructive'
    case undefined:
      return 'bg-muted-foreground/40'
  }
}

export function ServerListPanel(props: {
  onSelect: (serverId: string) => void
  onAdd: () => void
}): React.JSX.Element {
  const profiles = useServerFilesStore((s) => s.profiles)
  const sessions = useServerFilesStore((s) => s.sessions)
  const selectedServerId = useServerFilesStore((s) => s.selectedServerId)
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border">
      <div className="flex h-9 shrink-0 items-center px-3 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
        {translate('auto.components.serverFiles.list.title', 'Connections')}
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-1.5">
        {profiles?.map((profile) => (
          <button
            key={profile.id}
            type="button"
            data-current={profile.id === selectedServerId ? 'true' : undefined}
            onClick={() => props.onSelect(profile.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent',
              profile.id === selectedServerId && 'bg-accent'
            )}
          >
            <span className={cn('size-2 shrink-0 rounded-full', statusDot(sessions[profile.id]))} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{profile.label}</span>
              <span className="block truncate font-mono text-2xs text-muted-foreground">
                {serverEndpointText(profile)}
              </span>
            </span>
          </button>
        ))}
        {profiles?.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-muted-foreground">
            <Server className="size-5" />
            {translate('auto.components.serverFiles.list.empty', 'No servers yet')}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 border-t border-border p-2">
        <Button variant="outline" size="sm" className="w-full" onClick={props.onAdd}>
          <Plus />
          {translate('auto.components.serverFiles.list.add', 'New connection')}
        </Button>
      </div>
    </aside>
  )
}
