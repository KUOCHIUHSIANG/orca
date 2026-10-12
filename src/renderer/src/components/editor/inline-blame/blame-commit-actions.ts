import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { useBottomPanelState } from '@/lib/bottom-panel-state'
import type { GitBlameCommit } from '../../../../../shared/git-blame'
import { useGitToolWindowState } from '../../bottom-panel/git/git-tool-window-state'
import type { InlineBlameFile } from './inline-blame-file'

export async function copyBlameCommitHash(sha: string): Promise<void> {
  const label = translate('auto.components.right.sidebar.SourceControl.d172a4f068', 'Commit hash')
  try {
    await window.api.ui.writeClipboardText(sha)
    toast.success(
      translate('auto.components.right.sidebar.SourceControl.bf5082de46', '{{value0}} copied', {
        value0: label
      })
    )
  } catch {
    toast.error(
      translate(
        'auto.components.right.sidebar.SourceControl.c06193ef57',
        'Failed to copy {{value0}}',
        { value0: label.toLowerCase() }
      )
    )
  }
}

/** Opens this file's before/after diff for the commit in an editor tab. */
export function openBlameCommitDiff(file: InlineBlameFile, commit: GitBlameCommit): void {
  const renamed = commit.previousPath !== undefined && commit.previousPath !== commit.path
  useAppStore.getState().openCommitDiff(
    file.worktreeId,
    file.worktreePath,
    {
      path: commit.path,
      // Why: blame omits `previous` exactly when this commit created the file.
      status: commit.previousSha ? (renamed ? 'renamed' : 'modified') : 'added',
      oldPath: renamed ? commit.previousPath : undefined
    },
    {
      commitOid: commit.sha,
      parentOid: commit.previousSha ?? null,
      compareRef: commit.sha.slice(0, 7),
      baseRef: commit.previousSha ? commit.previousSha.slice(0, 7) : 'empty tree',
      subject: commit.summary
    },
    detectLanguage(commit.path),
    { runtimeEnvironmentId: file.runtimeEnvironmentId ?? undefined }
  )
}

/** Opens the bottom panel's Git tab with the commit selected and scrolled into view. */
export function revealBlameCommitInGitLog(file: InlineBlameFile, sha: string): void {
  useGitToolWindowState.getState().revealCommit(file.worktreeId, sha)
  useBottomPanelState.getState().show('git')
}

/** System browser rather than Orca's, so the user's existing GitLab/GitHub login applies. */
export function openBlameCommitRemote(url: string): void {
  void window.api.shell.openUrl(url)
}
