import type { editor, IDisposable } from 'monaco-editor'
import { monaco } from '@/lib/monaco-setup'
import {
  getGitChangeMarkerLines,
  getGitChangePeekAfterLine,
  type GitChangeHunk
} from './git-change-hunks'
import {
  GIT_CHANGE_PEEK_BORDER_PX,
  GIT_CHANGE_PEEK_HEADER_HEIGHT_PX,
  getGitChangePeekBodyLineCount,
  getGitChangePeekFirstLine
} from './git-change-peek-layout'

export type GitChangePeekWidget = {
  /** Portal target for the React header. */
  readonly headerNode: HTMLElement
  /** Buffer line the peek follows through edits, for re-anchoring after hunks recompute. */
  getAnchorLine(): number | null
  show(hunk: GitChangeHunk, options: { reveal: boolean }): void
  isDisposed(): boolean
  dispose(): void
}

let nextPeekWidgetId = 0

function readFontOptions(hostEditor: editor.ICodeEditor): editor.IDiffEditorOptions {
  const { EditorOption } = monaco.editor
  return {
    fontSize: hostEditor.getOption(EditorOption.fontSize),
    fontFamily: hostEditor.getOption(EditorOption.fontFamily),
    lineHeight: hostEditor.getOption(EditorOption.lineHeight),
    wordWrap: hostEditor.getOption(EditorOption.wordWrap)
  }
}

/**
 * VS Code-style inline diff under a hunk: a view zone reserves the space and an overlay widget
 * paints the peek over it, so the embedded diff editor gets normal mouse and focus handling.
 */
export function createGitChangePeekWidget({
  hostEditor,
  originalContent,
  onEscape
}: {
  hostEditor: editor.IStandaloneCodeEditor
  originalContent: string
  onEscape: () => void
}): GitChangePeekWidget | null {
  const model = hostEditor.getModel()
  if (!model) {
    return null
  }
  const widgetId = `orca.gitChangePeek.${++nextPeekWidgetId}`
  const container = document.createElement('div')
  container.className = 'orca-git-change-peek'
  // Hidden until the zone reports its first position, so it never flashes at the editor's top.
  container.style.display = 'none'
  const headerNode = document.createElement('div')
  headerNode.className = 'orca-git-change-peek-header'
  headerNode.style.height = `${GIT_CHANGE_PEEK_HEADER_HEIGHT_PX}px`
  const bodyNode = document.createElement('div')
  bodyNode.className = 'orca-git-change-peek-body'
  container.append(headerNode, bodyNode)

  const overlayWidget: editor.IOverlayWidget = {
    getId: () => widgetId,
    getDomNode: () => container,
    getPosition: () => null
  }
  hostEditor.addOverlayWidget(overlayWidget)

  const originalModel = monaco.editor.createModel(originalContent, model.getLanguageId())
  const diffEditor = monaco.editor.createDiffEditor(bodyNode, {
    ...readFontOptions(hostEditor),
    renderSideBySide: false,
    readOnly: true,
    originalEditable: false,
    // Why: the gutter markers compare lines exactly, so the peek must not hide whitespace-only edits.
    ignoreTrimWhitespace: false,
    automaticLayout: true,
    minimap: { enabled: false },
    renderOverviewRuler: false,
    renderMarginRevertIcon: false,
    renderGutterMenu: false,
    glyphMargin: false,
    folding: false,
    scrollBeyondLastLine: false,
    stickyScroll: { enabled: false },
    dropIntoEditor: { enabled: false },
    padding: { top: 0 },
    // Why: once the peek hits its end, let the wheel keep scrolling the file behind it.
    scrollbar: { alwaysConsumeMouseWheel: false }
  })
  // The buffer's own model is the modified side, so the peek tracks unsaved edits live.
  diffEditor.setModel({ original: originalModel, modified: model })

  const anchor = hostEditor.createDecorationsCollection()
  let zone: { id: string; delegate: editor.IViewZone } | null = null
  let pendingPeekLine: number | null = null
  let disposed = false

  const revealInPeek = (line: number): void => {
    const modifiedEditor = diffEditor.getModifiedEditor()
    modifiedEditor.setScrollTop(modifiedEditor.getTopForLineNumber(line))
    modifiedEditor.setScrollLeft(0)
  }

  const syncWidth = (): void => {
    const layout = hostEditor.getLayoutInfo()
    const width = layout.width - layout.minimap.minimapWidth - layout.verticalScrollbarWidth
    container.style.width = `${Math.max(0, width)}px`
  }
  syncWidth()

  const revealInHost = (hunk: GitChangeHunk, afterLineNumber: number, heightInPx: number): void => {
    const lineHeight = hostEditor.getOption(monaco.editor.EditorOption.lineHeight)
    const markerTop = hostEditor.getTopForLineNumber(getGitChangeMarkerLines(hunk).start)
    const zoneBottom =
      afterLineNumber === 0
        ? heightInPx
        : hostEditor.getBottomForLineNumber(afterLineNumber) + heightInPx
    const scrollTop = hostEditor.getScrollTop()
    const viewportHeight = hostEditor.getLayoutInfo().height
    // Keep the whole peek on screen, but never push the hunk's first line off the top.
    const highestUsefulTop = Math.max(0, markerTop - lineHeight)
    if (zoneBottom > scrollTop + viewportHeight) {
      hostEditor.setScrollTop(
        Math.min(zoneBottom - viewportHeight, highestUsefulTop),
        monaco.editor.ScrollType.Smooth
      )
    } else if (markerTop < scrollTop) {
      hostEditor.setScrollTop(highestUsefulTop, monaco.editor.ScrollType.Smooth)
    }
  }

  const onContainerKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onEscape()
    }
  }
  container.addEventListener('keydown', onContainerKeyDown)

  const disposables: IDisposable[] = [
    hostEditor.onDidLayoutChange(syncWidth),
    hostEditor.onDidChangeConfiguration(() =>
      diffEditor.updateOptions(readFontOptions(hostEditor))
    ),
    diffEditor.onDidUpdateDiff(() => {
      if (pendingPeekLine !== null) {
        revealInPeek(pendingPeekLine)
        pendingPeekLine = null
      }
    })
  ]

  return {
    headerNode,
    getAnchorLine: () => anchor.getRange(0)?.startLineNumber ?? null,
    isDisposed: () => disposed,
    show(hunk, { reveal }) {
      if (disposed) {
        return
      }
      container.dataset.kind = hunk.kind
      const lineHeight = hostEditor.getOption(monaco.editor.EditorOption.lineHeight)
      const viewportLines = Math.floor(hostEditor.getLayoutInfo().height / lineHeight)
      const heightInPx =
        GIT_CHANGE_PEEK_HEADER_HEIGHT_PX +
        GIT_CHANGE_PEEK_BORDER_PX +
        getGitChangePeekBodyLineCount(hunk, viewportLines) * lineHeight
      const afterLineNumber = getGitChangePeekAfterLine(hunk)
      const markerLine = getGitChangeMarkerLines(hunk).start
      anchor.set([
        {
          range: new monaco.Range(markerLine, 1, markerLine, 1),
          options: {
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
          }
        }
      ])
      hostEditor.changeViewZones((accessor) => {
        if (zone) {
          // Mutating the delegate then layoutZone is Monaco's supported in-place move/resize.
          zone.delegate.afterLineNumber = afterLineNumber
          zone.delegate.heightInPx = heightInPx
          accessor.layoutZone(zone.id)
          return
        }
        const delegate: editor.IViewZone = {
          afterLineNumber,
          heightInPx,
          domNode: document.createElement('div'),
          onDomNodeTop: (top) => {
            container.style.top = `${top}px`
            container.style.display = ''
          },
          onComputedHeight: (height) => {
            container.style.height = `${height}px`
          }
        }
        zone = { id: accessor.addZone(delegate), delegate }
      })
      if (!reveal) {
        return
      }
      revealInHost(hunk, afterLineNumber, heightInPx)
      const peekLine = getGitChangePeekFirstLine(hunk)
      // Line tops in the inline diff shift once deleted-line zones exist, so wait for the first diff.
      if (diffEditor.getLineChanges() === null) {
        pendingPeekLine = peekLine
      } else {
        revealInPeek(peekLine)
      }
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      for (const disposable of disposables) {
        disposable.dispose()
      }
      container.removeEventListener('keydown', onContainerKeyDown)
      anchor.clear()
      const zoneId = zone?.id
      if (zoneId && hostEditor.getModel()) {
        hostEditor.changeViewZones((accessor) => accessor.removeZone(zoneId))
      }
      hostEditor.removeOverlayWidget(overlayWidget)
      diffEditor.dispose()
      originalModel.dispose()
    }
  }
}
