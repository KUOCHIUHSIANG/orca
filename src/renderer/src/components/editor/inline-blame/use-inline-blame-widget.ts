import { useEffect, useRef, useState } from 'react'
import type { editor, IPosition } from 'monaco-editor'
import { monaco } from '@/lib/monaco-setup'

// Below this the truncated annotation is mostly an ellipsis, so hide it instead.
const MIN_ANNOTATION_WIDTH = 96
// Gap between the line's last character and the annotation, in editor character widths.
const ANNOTATION_GAP_CHARS = 4

/**
 * A content widget pinned after the end of `line`, sized to the space left in the viewport
 * so long messages truncate instead of widening the line. React renders into `node`.
 */
export function useInlineBlameWidget(
  editorInstance: editor.IStandaloneCodeEditor,
  line: number | null
): HTMLElement | null {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const widgetRef = useRef<{ widget: editor.IContentWidget; update: () => void } | null>(null)
  const positionRef = useRef<IPosition | null>(null)

  useEffect(() => {
    const domNode = document.createElement('div')
    // Why: only the text takes the pointer, so clicks in the gap still place the caret.
    domNode.className = 'pointer-events-none'
    domNode.dataset.orcaInlineBlame = ''
    const widget: editor.IContentWidget = {
      // Why: overflowing would let the annotation paint over the minimap and scrollbar.
      allowEditorOverflow: false,
      suppressMouseDown: true,
      getId: () => 'orca.inline-blame',
      getDomNode: () => domNode,
      getPosition: () =>
        positionRef.current
          ? {
              position: positionRef.current,
              preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
            }
          : null
    }

    const update = (): void => {
      const model = editorInstance.getModel()
      const target = positionRef.current
      const visible = target ? editorInstance.getScrolledVisiblePosition(target) : null
      const fontInfo = editorInstance.getOption(monaco.editor.EditorOption.fontInfo)
      const layout = editorInstance.getLayoutInfo()
      const gap = Math.round(fontInfo.typicalHalfwidthCharacterWidth * ANNOTATION_GAP_CHARS)
      const width = visible ? layout.contentLeft + layout.contentWidth - visible.left - gap : 0
      const show = Boolean(model && target && visible) && width >= MIN_ANNOTATION_WIDTH
      domNode.style.display = show ? '' : 'none'
      domNode.style.paddingLeft = `${gap}px`
      domNode.style.maxWidth = `${Math.max(0, width) + gap}px`
      domNode.style.height = `${fontInfo.lineHeight}px`
      domNode.style.lineHeight = `${fontInfo.lineHeight}px`
      domNode.style.fontFamily = fontInfo.fontFamily
      domNode.style.fontSize = `${fontInfo.fontSize}px`
      editorInstance.layoutContentWidget(widget)
    }

    editorInstance.addContentWidget(widget)
    widgetRef.current = { widget, update }
    setNode(domNode)
    const listeners = [
      editorInstance.onDidScrollChange(update),
      editorInstance.onDidLayoutChange(update),
      editorInstance.onDidChangeConfiguration(update),
      // Why: typing on the line moves its end, which the pinned column no longer matches.
      editorInstance.onDidChangeModelContent(() => {
        const target = positionRef.current
        const model = editorInstance.getModel()
        if (target && model && target.lineNumber <= model.getLineCount()) {
          positionRef.current = {
            lineNumber: target.lineNumber,
            column: model.getLineMaxColumn(target.lineNumber)
          }
        }
        update()
      })
    ]
    return () => {
      for (const listener of listeners) {
        listener.dispose()
      }
      editorInstance.removeContentWidget(widget)
      widgetRef.current = null
      setNode(null)
    }
  }, [editorInstance])

  useEffect(() => {
    const model = editorInstance.getModel()
    positionRef.current =
      line !== null && model && line <= model.getLineCount()
        ? { lineNumber: line, column: model.getLineMaxColumn(line) }
        : null
    widgetRef.current?.update()
  }, [editorInstance, line])

  return node
}
