import { useEffect, useState } from 'react'
import type { editor } from 'monaco-editor'
import { useAppStore } from '@/store'
import { readGitChangeBaseline, type GitChangeFile } from './git-change-baseline'
import {
  areGitChangeHunksEqual,
  computeGitChangeHunks,
  splitTextLines,
  type GitChangeHunk
} from './git-change-hunks'

// Why: re-diffing the whole buffer per keystroke competes with typing; markers may lag a beat.
const RECOMPUTE_DEBOUNCE_MS = 200

const NO_HUNKS: readonly GitChangeHunk[] = []

/** HEAD's copy of the file, re-read whenever the worktree's HEAD moves. */
export function useGitChangeBaseline(file: GitChangeFile | null): string | null {
  const head = useAppStore((state) =>
    file ? state.gitStatusHeadByWorktree[file.worktreeId] : undefined
  )
  const [baseline, setBaseline] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setBaseline(null)
      return
    }
    let disposed = false
    readGitChangeBaseline(file)
      .then((next) => {
        if (!disposed) {
          setBaseline(next)
        }
      })
      .catch(() => {
        // Why: non-git folders and unreachable hosts fail every time; wait for HEAD to move instead.
        if (!disposed) {
          setBaseline(null)
        }
      })
    return () => {
      disposed = true
    }
  }, [file, head])

  return baseline
}

/** Buffer-vs-HEAD hunks, live with unsaved edits. */
export function useGitChangeHunks(
  editorInstance: editor.IStandaloneCodeEditor,
  baseline: string | null
): readonly GitChangeHunk[] {
  const [hunks, setHunks] = useState<readonly GitChangeHunk[]>(NO_HUNKS)

  useEffect(() => {
    const model = editorInstance.getModel()
    if (baseline === null || !model) {
      setHunks(NO_HUNKS)
      return
    }
    const baselineLines = splitTextLines(baseline)
    let timer: ReturnType<typeof setTimeout> | null = null
    const recompute = (): void => {
      timer = null
      if (model.isDisposed()) {
        return
      }
      const next = computeGitChangeHunks(baselineLines, model.getLinesContent()) ?? NO_HUNKS
      setHunks((previous) => (areGitChangeHunksEqual(previous, next) ? previous : next))
    }
    recompute()
    const contentListener = model.onDidChangeContent(() => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(recompute, RECOMPUTE_DEBOUNCE_MS)
    })
    return () => {
      contentListener.dispose()
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [baseline, editorInstance])

  return hunks
}
