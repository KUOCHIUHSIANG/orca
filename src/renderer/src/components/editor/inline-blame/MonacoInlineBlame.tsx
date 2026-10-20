import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { editor } from 'monaco-editor'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { getConnectionIdForFileFromState } from '@/lib/connection-owner-resolution'
import { useAppStore } from '@/store'
import type { GitBlameCommit } from '../../../../../shared/git-blame'
import { parseWorkspaceKey } from '../../../../../shared/workspace-scope'
import { BlameCommitCard } from './BlameCommitCard'
import { formatInlineBlameText, isUncommittedBlame } from './inline-blame-format'
import type { InlineBlameFile } from './inline-blame-file'
import { useInlineBlameResult } from './use-inline-blame-result'
import { useInlineBlameWidget } from './use-inline-blame-widget'

type CursorState = { line: number | null; versionId: number }

function readCursorState(editorInstance: editor.IStandaloneCodeEditor): CursorState {
  return {
    line: editorInstance.getPosition()?.lineNumber ?? null,
    versionId: editorInstance.getModel()?.getVersionId() ?? -1
  }
}

function useCursorState(editorInstance: editor.IStandaloneCodeEditor): CursorState {
  const [state, setState] = useState(() => readCursorState(editorInstance))
  useEffect(() => {
    const update = (): void => {
      const next = readCursorState(editorInstance)
      setState((previous) =>
        previous.line === next.line && previous.versionId === next.versionId ? previous : next
      )
    }
    const listeners = [
      editorInstance.onDidChangeCursorPosition(update),
      editorInstance.onDidChangeModelContent(update),
      editorInstance.onDidChangeModel(update)
    ]
    update()
    return () => {
      for (const listener of listeners) {
        listener.dispose()
      }
    }
  }, [editorInstance])
  return state
}

function InlineBlameAnnotation({
  file,
  commit,
  originalLine,
  onPlaceCaret
}: {
  file: InlineBlameFile
  commit: GitBlameCommit
  originalLine: number
  onPlaceCaret: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const text = (
    <span
      className="pointer-events-auto block cursor-text truncate italic text-muted-foreground/70"
      // Why: like clicking past a line's end in the editor, put the caret at that end.
      onMouseDown={(event) => {
        if (event.button === 0) {
          onPlaceCaret()
        }
      }}
    >
      {formatInlineBlameText(commit)}
    </span>
  )
  if (isUncommittedBlame(commit)) {
    return text
  }
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={300} closeDelay={150}>
      <HoverCardTrigger asChild>{text}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" variant="commit-details">
        <BlameCommitCard
          file={file}
          commit={commit}
          originalLine={originalLine}
          onDone={() => setOpen(false)}
        />
      </HoverCardContent>
    </HoverCard>
  )
}

/** GitLens-style blame after the cursor's line, with a commit card on hover. */
export function MonacoInlineBlame({
  editorInstance,
  fileId,
  filePath,
  relativePath,
  worktreeId
}: {
  editorInstance: editor.IStandaloneCodeEditor
  fileId: string
  filePath: string
  relativePath: string
  worktreeId: string
}): React.JSX.Element | null {
  const runtimeEnvironmentId = useAppStore(
    (state) => state.openFiles.find((entry) => entry.id === fileId)?.runtimeEnvironmentId
  )
  // Why: undefined means the owning host is not known yet; a local read of a remote path would fail.
  const connectionId = useAppStore((state) =>
    getConnectionIdForFileFromState(state, worktreeId, filePath)
  )
  const file = useMemo((): InlineBlameFile | null => {
    if (connectionId === undefined || !relativePath || !filePath.endsWith(relativePath)) {
      return null
    }
    return {
      fileId,
      worktreeId,
      worktreePath: filePath.slice(0, filePath.length - relativePath.length - 1),
      relativePath,
      runtimeEnvironmentId,
      connectionId: connectionId ?? undefined,
      isFolderWorkspace: parseWorkspaceKey(worktreeId)?.type === 'folder'
    }
  }, [connectionId, fileId, filePath, relativePath, runtimeEnvironmentId, worktreeId])

  const snapshot = useInlineBlameResult(editorInstance, file)
  const cursor = useCursorState(editorInstance)
  const entry =
    snapshot && cursor.line !== null && snapshot.versionId === cursor.versionId
      ? snapshot.result.lines[cursor.line - 1]
      : undefined
  const commit = entry ? snapshot?.result.commits[entry[0]] : undefined
  const node = useInlineBlameWidget(editorInstance, commit ? cursor.line : null)
  const submodulePath = snapshot?.result.submodulePath
  const blameFile = useMemo(
    () => (file && submodulePath ? { ...file, submodulePath } : file),
    [file, submodulePath]
  )

  if (!node || !blameFile || !commit || !entry) {
    return null
  }
  const line = cursor.line
  return createPortal(
    <InlineBlameAnnotation
      key={`${line}\0${commit.sha}`}
      file={blameFile}
      commit={commit}
      originalLine={entry[1]}
      onPlaceCaret={() => {
        const model = editorInstance.getModel()
        if (line !== null && model && line <= model.getLineCount()) {
          editorInstance.setPosition({ lineNumber: line, column: model.getLineMaxColumn(line) })
          editorInstance.focus()
        }
      }}
    />,
    node
  )
}
