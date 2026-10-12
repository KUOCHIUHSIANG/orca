import { useEffect, useState } from 'react'
import type { editor } from 'monaco-editor'
import { useAppStore } from '@/store'
import { getRuntimeGitBlame } from '@/runtime/runtime-git-diff-client'
import { GIT_BLAME_MAX_CONTENT_LENGTH, type GitBlameResult } from '../../../../../shared/git-blame'
import { toBlameRuntimeGitContext, type InlineBlameFile } from './inline-blame-file'

// Why: re-blaming per keystroke would queue a git process for every character typed.
const REBLAME_DEBOUNCE_MS = 500

export type InlineBlameSnapshot = {
  result: GitBlameResult
  /** Model version the blame describes; any later edit makes its line numbers unreliable. */
  versionId: number
}

/** Blames the editor's buffer and re-blames after edits settle or HEAD moves. */
export function useInlineBlameResult(
  editorInstance: editor.IStandaloneCodeEditor,
  file: InlineBlameFile | null
): InlineBlameSnapshot | null {
  const head = useAppStore((state) =>
    file ? state.gitStatusHeadByWorktree[file.worktreeId] : undefined
  )
  const [snapshot, setSnapshot] = useState<InlineBlameSnapshot | null>(null)

  useEffect(() => {
    const model = editorInstance.getModel()
    if (!file || !model) {
      setSnapshot(null)
      return
    }
    let disposed = false
    // Why: untracked files and non-git folders fail every time; wait for HEAD to move instead.
    let failed = false
    let requestSeq = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const run = (): void => {
      timer = null
      if (disposed || failed || model.isDisposed()) {
        return
      }
      if (model.getValueLength() > GIT_BLAME_MAX_CONTENT_LENGTH) {
        setSnapshot(null)
        return
      }
      const versionId = model.getVersionId()
      const isDirty =
        useAppStore.getState().openFiles.find((entry) => entry.id === file.fileId)?.isDirty === true
      const seq = ++requestSeq
      // Why: defer so an unresolved file owner lands in the catch below instead of throwing here.
      void Promise.resolve()
        .then(() =>
          getRuntimeGitBlame(toBlameRuntimeGitContext(file), {
            filePath: file.relativePath,
            // Why: a clean buffer matches disk, so skip shipping it over IPC or SSH.
            contents: isDirty ? model.getValue() : undefined
          })
        )
        .then((result) => {
          if (!disposed && seq === requestSeq) {
            setSnapshot({ result, versionId })
          }
        })
        .catch(() => {
          if (!disposed && seq === requestSeq) {
            failed = true
            setSnapshot(null)
          }
        })
    }

    run()
    const contentListener = model.onDidChangeContent(() => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(run, REBLAME_DEBOUNCE_MS)
    })
    return () => {
      disposed = true
      contentListener.dispose()
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [editorInstance, file, head])

  return snapshot
}
