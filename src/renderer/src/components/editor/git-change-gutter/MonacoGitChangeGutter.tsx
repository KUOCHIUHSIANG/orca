import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { editor } from 'monaco-editor'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { getConnectionIdForFileFromState } from '@/lib/connection-owner-resolution'
import { basename } from '@/lib/path'
import { useAppStore } from '@/store'
import type { GitChangeFile } from './git-change-baseline'
import { buildGitChangeDecorations, type GitChangeColors } from './git-change-decorations'
import type { GitChangeHunk } from './git-change-hunks'
import { GitChangePeekHeader } from './GitChangePeekHeader'
import { useGitChangeBaseline, useGitChangeHunks } from './use-git-change-hunks'
import { useGitChangePeek } from './use-git-change-peek'

// Why: the overview ruler and minimap paint on canvas, which cannot resolve CSS variables.
function readGitChangeColors(): GitChangeColors {
  const style = getComputedStyle(document.documentElement)
  return {
    added: style.getPropertyValue('--git-decoration-added').trim(),
    modified: style.getPropertyValue('--git-decoration-modified').trim(),
    deleted: style.getPropertyValue('--git-decoration-deleted').trim()
  }
}

function useGitChangeDecorations(
  editorInstance: editor.IStandaloneCodeEditor,
  hunks: readonly GitChangeHunk[]
): void {
  const isDark = useDocumentDarkTheme()
  const collectionRef = useRef<editor.IEditorDecorationsCollection | null>(null)

  useEffect(() => {
    const collection = editorInstance.createDecorationsCollection()
    collectionRef.current = collection
    return () => {
      collection.clear()
      collectionRef.current = null
    }
  }, [editorInstance])

  useEffect(() => {
    collectionRef.current?.set(buildGitChangeDecorations(hunks, readGitChangeColors()))
  }, [editorInstance, hunks, isDark])
}

/** VS Code-style change bars against HEAD in the gutter; clicking one opens an inline diff. */
export function MonacoGitChangeGutter({
  editorInstance,
  fileId,
  filePath,
  relativePath,
  worktreeId,
  readOnly
}: {
  editorInstance: editor.IStandaloneCodeEditor
  fileId: string
  filePath: string
  relativePath: string
  worktreeId: string
  readOnly: boolean
}): React.JSX.Element | null {
  const runtimeEnvironmentId = useAppStore(
    (state) => state.openFiles.find((entry) => entry.id === fileId)?.runtimeEnvironmentId
  )
  // Why: undefined means the owning host is not known yet; a local read of a remote path would fail.
  const connectionId = useAppStore((state) =>
    getConnectionIdForFileFromState(state, worktreeId, filePath)
  )
  const file = useMemo((): GitChangeFile | null => {
    if (connectionId === undefined) {
      return null
    }
    return {
      worktreeId,
      worktreePath: filePath.slice(0, filePath.length - relativePath.length - 1),
      relativePath,
      runtimeEnvironmentId,
      connectionId: connectionId ?? undefined
    }
  }, [connectionId, filePath, relativePath, runtimeEnvironmentId, worktreeId])

  const baseline = useGitChangeBaseline(file)
  const hunks = useGitChangeHunks(editorInstance, baseline)
  useGitChangeDecorations(editorInstance, hunks)
  const { peek, showHunk, close, revert } = useGitChangePeek(editorInstance, baseline, hunks)

  if (!peek || hunks.length === 0) {
    return null
  }
  const hunkCount = hunks.length
  return createPortal(
    <GitChangePeekHeader
      fileName={basename(relativePath)}
      hunkIndex={peek.hunkIndex}
      hunkCount={hunkCount}
      onRevert={readOnly ? undefined : revert}
      onPrevious={() => showHunk((peek.hunkIndex - 1 + hunkCount) % hunkCount)}
      onNext={() => showHunk((peek.hunkIndex + 1) % hunkCount)}
      onClose={() => close(true)}
    />,
    peek.widget.headerNode
  )
}
