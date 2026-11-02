import { useEffect, useState } from 'react'
import { Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useServerJobsStore } from './server-files-jobs-store'
import { connectServer, loadServerProfiles } from './server-files-navigation'
import { ServerFilesPromptsProvider } from './ServerFilesPrompts'
import { useServerFilesStore } from './server-files-store'
import { ServerListPanel } from './ServerListPanel'
import { ServerProfileDialog, type ProfileDialogRequest } from './ServerProfileDialog'
import { ServerWorkspace } from './ServerWorkspace'
import { isWebClientLocation } from '@/lib/web-client-location'

function useJobProgress(): void {
  useEffect(
    () =>
      window.api.serverFiles.onProgress((progress) =>
        useServerJobsStore.getState().setProgress(progress)
      ),
    []
  )
}

function ServerFilesPageBody(): React.JSX.Element {
  useJobProgress()
  const profiles = useServerFilesStore((s) => s.profiles)
  const selectedServerId = useServerFilesStore((s) => s.selectedServerId)
  const [profileDialog, setProfileDialog] = useState<ProfileDialogRequest | null>(null)
  const selected = profiles?.find((profile) => profile.id === selectedServerId) ?? null

  useEffect(() => {
    void loadServerProfiles()
  }, [])

  const select = (serverId: string): void => {
    const store = useServerFilesStore.getState()
    store.selectServer(serverId)
    if (!store.sessions[serverId]) {
      void connectServer(serverId)
    }
  }

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground md:pt-6">
      <header
        className="flex shrink-0 items-center gap-3 px-3 pb-3 md:px-5"
        // No stacked titlebar on this page; keep clear of Windows/Linux window controls.
        style={{ paddingRight: 'max(0.75rem, var(--window-controls-width, 0px))' }}
      >
        <h1 className="truncate text-base font-semibold leading-8">
          {translate('auto.components.sidebar.SidebarNav.servers', 'Servers')}
        </h1>
      </header>
      <div className="flex min-h-0 flex-1 border-t border-border">
        <ServerListPanel
          onSelect={select}
          onAdd={() => setProfileDialog({ profile: null, tab: 'connection' })}
        />
        {selected ? (
          <ServerWorkspace
            profile={selected}
            onEditProfile={(tab) =>
              setProfileDialog({ profile: selected, tab: tab ?? 'connection' })
            }
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <Server className="size-6" />
            <p className="max-w-sm">
              {translate(
                'auto.components.serverFiles.page.intro',
                'Browse, upload and back up files on your servers over SFTP. Nothing is installed on them.'
              )}
            </p>
            {profiles?.length === 0 ? (
              <Button
                size="sm"
                onClick={() => setProfileDialog({ profile: null, tab: 'connection' })}
              >
                {translate('auto.components.serverFiles.list.add', 'New connection')}
              </Button>
            ) : null}
          </div>
        )}
      </div>
      <ServerProfileDialog
        request={profileDialog}
        onClose={() => setProfileDialog(null)}
        onSaved={(profile) => {
          void loadServerProfiles().then(() => {
            const reconnect = useServerFilesStore.getState().sessions[profile.id] !== undefined
            select(profile.id)
            if (reconnect) {
              void connectServer(profile.id)
            }
          })
        }}
        onDeleted={(serverId) => {
          const store = useServerFilesStore.getState()
          store.setSession(serverId, null)
          if (store.selectedServerId === serverId) {
            store.selectServer(null)
          }
          void loadServerProfiles()
        }}
      />
    </main>
  )
}

export default function ServerFilesPage(): React.JSX.Element {
  if (isWebClientLocation()) {
    return (
      <main className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        {translate(
          'auto.components.serverFiles.page.desktopOnly',
          'Servers are available in the desktop app only.'
        )}
      </main>
    )
  }
  return (
    <ServerFilesPromptsProvider>
      <ServerFilesPageBody />
    </ServerFilesPromptsProvider>
  )
}
