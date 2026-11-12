import { ArrowDown, ArrowUp, CornerLeftUp, Folder, FolderSymlink } from 'lucide-react'
import { FileTypeIcon } from '@/components/FileTypeIcon'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/class-names'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { formatRemoteMode } from '../../../../shared/server-files-access'
import { isSameOrInsideRemotePath } from '../../../../shared/server-files-paths'
import type { RemoteEntry } from '../../../../shared/server-files-types'
import { formatBytes, formatModified } from './server-files-messages'

export type SortKey = 'name' | 'size' | 'modified' | 'mode' | 'owner' | 'group'
export type SortState = { key: SortKey; descending: boolean }

function isFolderLike(entry: RemoteEntry): boolean {
  return entry.kind === 'directory' || entry.targetIsDirectory
}

export function sortEntries(entries: readonly RemoteEntry[], sort: SortState): RemoteEntry[] {
  // Per call, so a language switch re-sorts with that language's rules.
  const collator = new Intl.Collator(getIntlLocale(), { numeric: true, sensitivity: 'base' })
  const compare = (a: RemoteEntry, b: RemoteEntry): number => {
    switch (sort.key) {
      case 'size':
        return a.size - b.size
      case 'modified':
        return a.modifiedMs - b.modifiedMs
      case 'mode':
        return formatRemoteMode(a.mode).localeCompare(formatRemoteMode(b.mode))
      case 'owner':
        return collator.compare(a.owner, b.owner)
      case 'group':
        return collator.compare(a.group, b.group)
      case 'name':
        return collator.compare(a.name, b.name)
    }
  }
  return [...entries].sort((a, b) => {
    // Folders stay on top in either direction, as in FileZilla.
    const folders = Number(isFolderLike(b)) - Number(isFolderLike(a))
    if (folders !== 0) {
      return folders
    }
    const order = compare(a, b) || collator.compare(a.name, b.name)
    return sort.descending ? -order : order
  })
}

// Every column stays readable in a narrow split pane; the table scrolls sideways instead.
const COLUMNS: { key: SortKey; className: string }[] = [
  { key: 'name', className: 'min-w-48 flex-1' },
  { key: 'size', className: 'w-20 shrink-0 justify-end text-right' },
  { key: 'modified', className: 'w-32 shrink-0' },
  { key: 'mode', className: 'w-24 shrink-0' },
  { key: 'owner', className: 'w-20 shrink-0' },
  { key: 'group', className: 'w-20 shrink-0' }
]

function columnLabel(key: SortKey): string {
  switch (key) {
    case 'name':
      return translate('auto.components.serverFiles.table.name', 'Name')
    case 'size':
      return translate('auto.components.serverFiles.table.size', 'Size')
    case 'modified':
      return translate('auto.components.serverFiles.table.modified', 'Modified')
    case 'mode':
      return translate('auto.components.serverFiles.table.permissions', 'Permissions')
    case 'owner':
      return translate('auto.components.serverFiles.table.owner', 'Owner')
    case 'group':
      return translate('auto.components.serverFiles.table.group', 'Group')
  }
}

export const SERVER_FILES_DRAG_TYPE = 'application/x-orca-server-files'

export type RemoteFileTableProps = {
  /** Already in display order (see sortEntries). */
  entries: readonly RemoteEntry[]
  sort: SortState
  onSortChange: (sort: SortState) => void
  selected: readonly string[]
  highlighted: readonly string[]
  canGoUp: boolean
  dragPayload: (paths: string[]) => string
  onSelect: (path: string, event: React.MouseEvent) => void
  onContextSelect: (path: string) => void
  onOpen: (entry: RemoteEntry) => void
  onGoUp: () => void
}

export function RemoteFileTable(props: RemoteFileTableProps): React.JSX.Element {
  const { entries: sorted, sort, selected, highlighted, canGoUp, onSelect, onOpen, onGoUp } = props
  const isHighlighted = (entry: RemoteEntry): boolean =>
    highlighted.some((path) => isSameOrInsideRemotePath(path, entry.path))

  return (
    <div
      className="scrollbar-sleek min-h-0 flex-1 overflow-auto text-[13px]"
      role="grid"
      aria-rowcount={sorted.length}
    >
      <div className="min-w-[42rem] pb-0.5">
        <div
          className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-1 text-xs text-muted-foreground"
          role="row"
        >
          {COLUMNS.map((column) => (
            <button
              key={column.key}
              type="button"
              role="columnheader"
              aria-sort={
                sort.key === column.key ? (sort.descending ? 'descending' : 'ascending') : 'none'
              }
              className={cn(
                'flex items-center gap-1 truncate text-left hover:text-foreground',
                column.className
              )}
              onClick={() =>
                props.onSortChange({
                  key: column.key,
                  descending: sort.key === column.key ? !sort.descending : false
                })
              }
            >
              {columnLabel(column.key)}
              {sort.key === column.key ? (
                sort.descending ? (
                  <ArrowDown className="size-3" />
                ) : (
                  <ArrowUp className="size-3" />
                )
              ) : null}
            </button>
          ))}
        </div>
        {canGoUp ? (
          <div
            role="row"
            className="flex cursor-default items-center gap-2 px-3 py-1 text-muted-foreground hover:bg-accent"
            onDoubleClick={onGoUp}
          >
            <CornerLeftUp className="size-4" />
            <span>..</span>
          </div>
        ) : null}
        {sorted.map((entry) => {
          const isSelected = selected.includes(entry.path)
          return (
            <div
              key={entry.path}
              role="row"
              aria-selected={isSelected}
              data-server-files-path={entry.path}
              data-server-files-folder={isFolderLike(entry) ? 'true' : undefined}
              draggable
              onDragStart={(event) => {
                const paths = isSelected ? [...selected] : [entry.path]
                event.dataTransfer.setData(SERVER_FILES_DRAG_TYPE, props.dragPayload(paths))
                event.dataTransfer.effectAllowed = 'copy'
              }}
              onMouseDown={(event) => {
                if (event.button === 0) {
                  onSelect(entry.path, event)
                } else if (event.button === 2) {
                  props.onContextSelect(entry.path)
                }
              }}
              onDoubleClick={() => onOpen(entry)}
              className={cn(
                'flex cursor-default items-center gap-2 px-3 py-1 hover:bg-accent',
                isSelected && 'bg-accent',
                isHighlighted(entry) && !isSelected && 'bg-accent/50'
              )}
            >
              <span className="flex min-w-48 flex-1 items-center gap-2">
                {entry.kind === 'directory' ? (
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                ) : entry.targetIsDirectory ? (
                  <FolderSymlink className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileTypeIcon filePath={entry.name} className="size-4 shrink-0" />
                )}
                <span className="truncate">{entry.name}</span>
                {isHighlighted(entry) ? (
                  <Badge variant="outline">
                    {translate('auto.components.serverFiles.table.justCopied', 'Just copied')}
                  </Badge>
                ) : null}
              </span>
              <span className="w-20 shrink-0 text-right text-muted-foreground tabular-nums">
                {isFolderLike(entry) ? '' : formatBytes(entry.size)}
              </span>
              <span className="w-32 shrink-0 text-muted-foreground tabular-nums">
                {formatModified(entry.modifiedMs)}
              </span>
              <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                {formatRemoteMode(entry.mode)}
              </span>
              <span className="w-20 shrink-0 truncate text-muted-foreground">{entry.owner}</span>
              <span className="w-20 shrink-0 truncate text-muted-foreground">{entry.group}</span>
            </div>
          )
        })}
        {sorted.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {translate('auto.components.serverFiles.table.empty', 'This folder is empty')}
          </p>
        ) : null}
      </div>
    </div>
  )
}
