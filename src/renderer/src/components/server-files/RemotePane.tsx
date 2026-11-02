import { useMemo, useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { createOsFileDropSequence, useOsFileDropOwner } from '@/hooks/use-os-file-drop-owner'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { RemoteEntry } from '../../../../shared/server-files-types'
import {
  RemoteFileTable,
  SERVER_FILES_DRAG_TYPE,
  sortEntries,
  type SortState
} from './RemoteFileTable'
import { RemotePaneNotice } from './RemotePaneNotice'
import { RemotePaneToolbar } from './RemotePaneToolbar'
import { RemotePathBar } from './RemotePathBar'
import { nextSelection, selectionModifiers } from './remote-selection'
import { errorSummary, formatBytes } from './server-files-messages'
import { navigatePane } from './server-files-navigation'
import { useServerFilesPrompts } from './server-files-prompts-context'
import { copyOnServer } from './server-files-remote-actions'
import { emptyWorkspace, useServerFilesStore, type PaneIndex } from './server-files-store'
import { downloadFromServer, uploadToServer } from './server-files-transfer-actions'
import { usePaneActions, type PaneAction, type PaneActionId } from './use-pane-actions'

const MENU_ITEMS: (PaneActionId | '-')[] = [
  'download',
  'download-to',
  'backup',
  'copy-across',
  'terminal',
  '-',
  'rename',
  'remove',
  '-',
  'copy-path',
  'protect'
]

function MenuItem({ action }: { action: PaneAction }): React.JSX.Element {
  return (
    <ContextMenuItem
      disabled={action.disabledReason !== null}
      onSelect={action.run}
      className="items-start"
    >
      <action.icon className="mt-0.5" />
      <span className="flex flex-col">
        {action.label}
        {action.disabledReason ? (
          <span className="max-w-64 text-2xs text-muted-foreground">{action.disabledReason}</span>
        ) : null}
      </span>
    </ContextMenuItem>
  )
}

type DragPayload = { serverId: string; pane: PaneIndex; paths: string[] }

function readDragPayload(event: React.DragEvent): DragPayload | null {
  try {
    const parsed: unknown = JSON.parse(event.dataTransfer.getData(SERVER_FILES_DRAG_TYPE))
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'serverId' in parsed &&
      'paths' in parsed &&
      'pane' in parsed
    ) {
      const { serverId, paths, pane } = parsed
      if (typeof serverId === 'string' && Array.isArray(paths) && (pane === 0 || pane === 1)) {
        return {
          serverId,
          pane,
          paths: paths.filter((path): path is string => typeof path === 'string')
        }
      }
    }
  } catch {
    // Not one of ours.
  }
  return null
}

function folderUnder(target: EventTarget | null): string | null {
  return target instanceof Element
    ? (target.closest<HTMLElement>('[data-server-files-folder="true"]')?.dataset.serverFilesPath ??
        null)
    : null
}

export function RemotePane({
  serverId,
  index
}: {
  serverId: string
  index: PaneIndex
}): React.JSX.Element {
  const prompts = useServerFilesPrompts()
  const workspace = useServerFilesStore((s) => s.workspaces[serverId]) ?? emptyWorkspace()
  const session = useServerFilesStore((s) => s.sessions[serverId])
  const updatePane = useServerFilesStore((s) => s.updatePane)
  const updateWorkspace = useServerFilesStore((s) => s.updateWorkspace)
  const pane = workspace.panes[index]
  const info = session?.status === 'connected' ? session.info : null
  const { actions, selected } = usePaneActions(serverId, index)
  const [sort, setSort] = useState<SortState>({ key: 'name', descending: false })
  const entries = useMemo(
    () => sortEntries(pane.listing?.entries ?? [], sort),
    [pane.listing, sort]
  )
  const [dropping, setDropping] = useState(false)
  const rootRef = useRef<HTMLElement | null>(null)
  const sequence = useMemo(() => createOsFileDropSequence(), [])
  const dropRef = useOsFileDropOwner<string | null>(rootRef, {
    consumer: 'main-reader',
    sequence,
    canAccept: () => actions['upload-files'].disabledReason === null,
    captureDestination: (event) => folderUnder(event.target),
    onDrop: async (prepared, context) => {
      if (prepared.paths.length > 0 && pane.path) {
        await uploadToServer(
          prompts,
          serverId,
          prepared.paths,
          context.destination ?? pane.path,
          'items'
        )
      }
    }
  })

  const navigate = (path: string): void => void navigatePane(serverId, index, path)
  const open = (entry: RemoteEntry): void => {
    if (entry.kind === 'directory' || entry.targetIsDirectory) {
      navigate(entry.path)
    } else {
      void downloadFromServer(prompts, serverId, [entry.path])
    }
  }
  const select = (path: string, event: React.MouseEvent): void => {
    const next = nextSelection(
      entries.map((entry) => entry.path),
      pane.selected,
      pane.anchor,
      path,
      selectionModifiers(event)
    )
    updatePane(serverId, index, { ...next, highlighted: [] })
  }
  const totalSelected = selected.reduce(
    (sum, entry) => sum + (entry.kind === 'file' ? entry.size : 0),
    0
  )

  return (
    <section
      className={cn(
        'flex min-w-0 flex-1 flex-col',
        workspace.split && workspace.activePane === index && 'bg-accent/10'
      )}
      onMouseDownCapture={() =>
        workspace.activePane !== index && updateWorkspace(serverId, { activePane: index })
      }
    >
      <RemotePathBar
        path={pane.path}
        loading={pane.loading}
        homePath={info?.homePath ?? null}
        onNavigate={navigate}
        onRefresh={() => pane.path && navigate(pane.path)}
      />
      {pane.listing && info ? <RemotePaneNotice listing={pane.listing} info={info} /> : null}
      <RemotePaneToolbar actions={actions} split={workspace.split} />
      {pane.error && !pane.listing ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
          <AlertCircle className="size-5 text-destructive" />
          <p>{errorSummary(pane.error)}</p>
          {pane.error.detail ? (
            <p className="max-w-md font-mono text-xs text-muted-foreground break-all">
              {pane.error.detail}
            </p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(pane.path ?? info?.homePath ?? '/')}
          >
            {translate('auto.components.serverFiles.pane.retry', 'Try again')}
          </Button>
        </div>
      ) : !pane.listing ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={dropRef}
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                dropping && 'ring-2 ring-ring ring-inset'
              )}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(SERVER_FILES_DRAG_TYPE)) {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                  setDropping(true)
                }
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(event) => {
                setDropping(false)
                const payload = readDragPayload(event)
                if (
                  !payload ||
                  payload.serverId !== serverId ||
                  payload.pane === index ||
                  !pane.path
                ) {
                  return
                }
                event.preventDefault()
                void copyOnServer(prompts, {
                  kind: 'copy',
                  serverId,
                  sources: payload.paths,
                  destinationDir: folderUnder(event.target) ?? pane.path
                })
              }}
            >
              <RemoteFileTable
                entries={entries}
                sort={sort}
                onSortChange={setSort}
                selected={pane.selected}
                highlighted={pane.highlighted}
                canGoUp={pane.path !== '/'}
                dragPayload={(paths) => JSON.stringify({ serverId, pane: index, paths })}
                onSelect={select}
                onContextSelect={(path) =>
                  !pane.selected.includes(path) &&
                  updatePane(serverId, index, { selected: [path], anchor: path })
                }
                onOpen={open}
                onGoUp={() =>
                  pane.path && navigate(pane.path.slice(0, pane.path.lastIndexOf('/')) || '/')
                }
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-60">
            {MENU_ITEMS.filter((id) => id !== 'copy-across' || workspace.split).map(
              (id, position) =>
                id === '-' ? (
                  <ContextMenuSeparator key={`sep-${position}`} />
                ) : (
                  <MenuItem key={id} action={actions[id]} />
                )
            )}
          </ContextMenuContent>
        </ContextMenu>
      )}
      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border px-3 text-xs text-muted-foreground">
        <span>
          {selected.length > 0
            ? translate(
                'auto.components.serverFiles.pane.selected',
                '{{value0}} selected · {{value1}}',
                {
                  value0: selected.length,
                  value1: formatBytes(totalSelected)
                }
              )
            : translate('auto.components.serverFiles.pane.count', '{{value0}} items', {
                value0: pane.listing?.entries.length ?? 0
              })}
        </span>
        {pane.listing?.freeBytes !== null && pane.listing?.freeBytes !== undefined ? (
          <span className="ml-auto">
            {translate('auto.components.serverFiles.pane.free', '{{value0}} free', {
              value0: formatBytes(pane.listing.freeBytes)
            })}
          </span>
        ) : null}
      </footer>
    </section>
  )
}
