import type { editor } from 'monaco-editor'
import {
  getGitChangeMarkerLines,
  type GitChangeHunk,
  type GitChangeHunkKind
} from './git-change-hunks'

export type GitChangeColors = Record<GitChangeHunkKind, string>

/** Every gutter marker carries this class; the click handler keys off it. */
export const GIT_CHANGE_MARKER_CLASS = 'orca-git-change-marker'

const MARKER_CLASS_NAMES = {
  added: 'orca-git-change-marker orca-git-change-added',
  modified: 'orca-git-change-marker orca-git-change-modified',
  deleted: 'orca-git-change-marker orca-git-change-deleted',
  deletedAtTop: 'orca-git-change-marker orca-git-change-deleted orca-git-change-deleted-top'
} as const

// Monaco's OverviewRulerLane.Left and MinimapPosition.Gutter; literals keep this module free of the Monaco runtime.
const OVERVIEW_RULER_LANE_LEFT = 1
const MINIMAP_POSITION_GUTTER = 2

function getMarkerClassName(hunk: GitChangeHunk): string {
  if (hunk.kind !== 'deleted') {
    return MARKER_CLASS_NAMES[hunk.kind]
  }
  return hunk.modifiedStartLine === 0 ? MARKER_CLASS_NAMES.deletedAtTop : MARKER_CLASS_NAMES.deleted
}

export function buildGitChangeDecorations(
  hunks: readonly GitChangeHunk[],
  colors: GitChangeColors
): editor.IModelDeltaDecoration[] {
  return hunks.map((hunk) => {
    const { start, end } = getGitChangeMarkerLines(hunk)
    const color = colors[hunk.kind]
    return {
      range: { startLineNumber: start, startColumn: 1, endLineNumber: end, endColumn: 1 },
      options: {
        isWholeLine: true,
        linesDecorationsClassName: getMarkerClassName(hunk),
        overviewRuler: { color, position: OVERVIEW_RULER_LANE_LEFT },
        minimap: { color, position: MINIMAP_POSITION_GUTTER }
      }
    }
  })
}
