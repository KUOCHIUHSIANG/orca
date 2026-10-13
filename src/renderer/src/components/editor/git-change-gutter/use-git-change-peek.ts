import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { editor } from 'monaco-editor'
import { monaco } from '@/lib/monaco-setup'
import { GIT_CHANGE_MARKER_CLASS } from './git-change-decorations'
import {
  computeGitChangeHunks,
  findClosestGitChangeHunkIndex,
  findGitChangeHunkIndexAtLine,
  splitTextLines,
  type GitChangeHunk
} from './git-change-hunks'
import { createGitChangePeekWidget, type GitChangePeekWidget } from './git-change-peek-widget'
import { buildGitChangeRevertEdit } from './git-change-revert'

export type GitChangePeekState = { widget: GitChangePeekWidget; hunkIndex: number }

type OpenPeek = { widget: GitChangePeekWidget }

function getClickedMarkerLine(event: editor.IEditorMouseEvent): number | null {
  const { target } = event
  if (target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS) {
    return null
  }
  // Why: the marker is 4px wide, inside the strip Monaco's folding toggle ignores, so the two never both fire.
  return target.element?.classList.contains(GIT_CHANGE_MARKER_CLASS)
    ? target.position.lineNumber
    : null
}

/** Opens, moves, and closes the inline diff peek; a gutter marker click toggles it. */
export function useGitChangePeek(
  editorInstance: editor.IStandaloneCodeEditor,
  baseline: string | null,
  hunks: readonly GitChangeHunk[]
): {
  peek: GitChangePeekState | null
  showHunk: (index: number) => void
  close: (focusEditor?: boolean) => void
  /** Puts the peeked hunk's HEAD lines back as an ordinary, undoable buffer edit. */
  revert: () => void
} {
  const widgetRef = useRef<GitChangePeekWidget | null>(null)
  const [openPeek, setOpenPeek] = useState<OpenPeek | null>(null)
  // Derived, not stored: the anchor decoration moves with the text, so it names the peeked hunk.
  // A widget disposed by the effects below (HEAD moved, every hunk reverted) reads as closed.
  const hunkIndex =
    openPeek && !openPeek.widget.isDisposed()
      ? findClosestGitChangeHunkIndex(hunks, openPeek.widget.getAnchorLine() ?? 1)
      : -1
  const peek = openPeek && hunkIndex >= 0 ? { widget: openPeek.widget, hunkIndex } : null
  const hunksRef = useRef(hunks)
  const peekRef = useRef(peek)
  useLayoutEffect(() => {
    hunksRef.current = hunks
    peekRef.current = peek
  })

  const disposeWidget = useCallback((): boolean => {
    const widget = widgetRef.current
    if (!widget) {
      return false
    }
    widgetRef.current = null
    widget.dispose()
    return true
  }, [])

  const close = useCallback(
    (focusEditor = false): void => {
      if (!disposeWidget()) {
        return
      }
      setOpenPeek(null)
      if (focusEditor) {
        editorInstance.focus()
      }
    },
    [disposeWidget, editorInstance]
  )

  const showHunk = useCallback(
    (index: number): void => {
      const hunk = hunksRef.current[index]
      if (!hunk || baseline === null) {
        return
      }
      const widget =
        widgetRef.current ??
        createGitChangePeekWidget({
          hostEditor: editorInstance,
          originalContent: baseline,
          onEscape: () => close(true)
        })
      if (!widget) {
        return
      }
      widgetRef.current = widget
      widget.show(hunk, { reveal: true })
      // New object even for the same widget: the moved anchor only shows up on re-render.
      setOpenPeek({ widget })
    },
    [baseline, close, editorInstance]
  )

  const revert = useCallback((): void => {
    const model = editorInstance.getModel()
    const widget = widgetRef.current
    if (!model || !widget || baseline === null) {
      return
    }
    // Why: re-diff now so an edit still inside the recompute debounce cannot skew the range.
    const baselineLines = splitTextLines(baseline)
    const currentHunks = computeGitChangeHunks(baselineLines, model.getLinesContent()) ?? []
    const index = findClosestGitChangeHunkIndex(currentHunks, widget.getAnchorLine() ?? 1)
    if (index >= 0) {
      const edit = buildGitChangeRevertEdit(currentHunks[index], baselineLines, {
        lineCount: model.getLineCount(),
        getLineMaxColumn: (lineNumber) => model.getLineMaxColumn(lineNumber),
        eol: model.getEOL()
      })
      // Undo stops on both sides make the revert its own Cmd+Z step.
      editorInstance.pushUndoStop()
      editorInstance.executeEdits('orca.gitChangeRevert', [
        { range: edit.range, text: edit.text, forceMoveMarkers: true }
      ])
      editorInstance.pushUndoStop()
    }
    close(true)
  }, [baseline, close, editorInstance])

  // A new HEAD snapshot (or editor) invalidates the peek's original-side model.
  useEffect(
    () => () => {
      disposeWidget()
    },
    [baseline, disposeWidget, editorInstance]
  )

  // Keep the zone under the peeked hunk as edits move or resize it.
  useEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const index = findClosestGitChangeHunkIndex(hunks, widget.getAnchorLine() ?? 1)
    if (index < 0) {
      disposeWidget()
      return
    }
    widget.show(hunks[index], { reveal: false })
  }, [disposeWidget, hunks])

  useEffect(() => {
    let pressedLine: number | null = null
    const listeners = [
      editorInstance.onMouseDown((event) => {
        pressedLine = event.event.leftButton ? getClickedMarkerLine(event) : null
      }),
      editorInstance.onMouseUp((event) => {
        const line = getClickedMarkerLine(event)
        const downLine = pressedLine
        pressedLine = null
        if (line === null || line !== downLine) {
          return
        }
        const index = findGitChangeHunkIndexAtLine(hunksRef.current, line)
        if (index < 0) {
          return
        }
        if (peekRef.current?.hunkIndex === index) {
          close()
          return
        }
        showHunk(index)
      }),
      // Not consumed, so Escape still dismisses find/suggest in the same press.
      editorInstance.onKeyDown((event) => {
        if (event.keyCode === monaco.KeyCode.Escape) {
          close()
        }
      })
    ]
    return () => {
      for (const listener of listeners) {
        listener.dispose()
      }
    }
  }, [close, editorInstance, showHunk])

  return { peek, showHunk, close, revert }
}
