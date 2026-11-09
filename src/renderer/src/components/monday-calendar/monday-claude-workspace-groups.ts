import type { AppState } from '@/store/types'
import { getFolderWorkspaceWorktree } from '@/store/workspace-record-selectors'
import type { DetachedWorkspaceGroup } from '../../../../shared/detached-pages'
import type { Worktree } from '../../../../shared/worktree/types'

type WorkspaceSources = Pick<AppState, 'repos' | 'worktreesByRepo' | 'folderWorkspaces'>

/** Open projects grouped by repo, then folders; the main window answers detached windows with it. */
export function openWorkspaceGroups(sources: WorkspaceSources): DetachedWorkspaceGroup[] {
  const toEntry = (worktree: Worktree): DetachedWorkspaceGroup['workspaces'][number] => ({
    id: worktree.id,
    displayName: worktree.displayName
  })
  const groups: DetachedWorkspaceGroup[] = sources.repos.map((repo) => ({
    id: repo.id,
    repoName: repo.displayName,
    workspaces: (sources.worktreesByRepo[repo.id] ?? [])
      .filter((worktree) => !worktree.isArchived)
      .map(toEntry)
  }))
  groups.push({
    id: 'folders',
    repoName: null,
    workspaces: sources.folderWorkspaces
      .filter((folder) => !folder.isArchived)
      .map((folder) => toEntry(getFolderWorkspaceWorktree(folder)))
  })
  return groups.filter((group) => group.workspaces.length > 0)
}
