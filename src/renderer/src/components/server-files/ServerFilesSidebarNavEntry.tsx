import { Server } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'

/** Matches the Monday and To Do entries beside it. */
export function ServerFilesSidebarNavEntry(): React.JSX.Element | null {
  const openServersPage = useAppStore((s) => s.openServersPage)
  const active = useAppStore((s) => s.activeView === 'servers')
  // Connections and transfers live in this computer's main process; web clients have neither.
  if (isWebClientLocation()) {
    return null
  }
  return (
    <button
      type="button"
      onClick={openServersPage}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <Server
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">
        {translate('auto.components.sidebar.SidebarNav.servers', 'Servers')}
      </span>
    </button>
  )
}
