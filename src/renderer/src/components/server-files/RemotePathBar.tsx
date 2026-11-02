import { useState } from 'react'
import { ArrowUp, ChevronRight, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { normalizeRemotePath, remoteParentPath } from '../../../../shared/server-files-paths'

export function RemotePathBar(props: {
  path: string | null
  loading: boolean
  homePath: string | null
  onNavigate: (path: string) => void
  onRefresh: () => void
}): React.JSX.Element {
  const { path, loading, homePath, onNavigate, onRefresh } = props
  const [editing, setEditing] = useState<string | null>(null)
  const segments = path ? path.split('/').filter(Boolean) : []
  const submit = (): void => {
    if (editing === null) {
      return
    }
    const typed = editing.trim()
    const expanded =
      homePath && (typed === '~' || typed.startsWith('~/')) ? homePath + typed.slice(1) : typed
    const normalized = normalizeRemotePath(expanded)
    setEditing(null)
    if (normalized && normalized !== path) {
      onNavigate(normalized)
    }
  }
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!path || path === '/'}
        onClick={() => path && onNavigate(remoteParentPath(path))}
        aria-label={translate('auto.components.serverFiles.path.up', 'Up one folder')}
      >
        <ArrowUp />
      </Button>
      {editing !== null ? (
        <Input
          autoFocus
          value={editing}
          onChange={(event) => setEditing(event.target.value)}
          onBlur={() => setEditing(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              submit()
            } else if (event.key === 'Escape') {
              setEditing(null)
            }
          }}
          className="h-7 flex-1"
        />
      ) : (
        <div
          className="flex min-w-0 flex-1 items-center overflow-x-auto font-mono text-xs"
          onDoubleClick={() => setEditing(path ?? '/')}
          title={translate(
            'auto.components.serverFiles.path.editHint',
            'Double-click to type a path'
          )}
        >
          <button
            type="button"
            className="rounded px-1 py-0.5 hover:bg-accent"
            onClick={() => onNavigate('/')}
          >
            /
          </button>
          {segments.map((segment, index) => {
            const target = `/${segments.slice(0, index + 1).join('/')}`
            return (
              <span key={target} className="flex shrink-0 items-center">
                {index > 0 ? <ChevronRight className="size-3 text-muted-foreground" /> : null}
                <button
                  type="button"
                  className="rounded px-1 py-0.5 hover:bg-accent"
                  onClick={() => onNavigate(target)}
                >
                  {segment}
                </button>
              </span>
            )
          })}
        </div>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRefresh}
        disabled={!path || loading}
        aria-label={translate('auto.components.serverFiles.path.refresh', 'Refresh')}
      >
        {loading ? <Loader2 className="animate-spin" /> : <RotateCw />}
      </Button>
    </div>
  )
}
