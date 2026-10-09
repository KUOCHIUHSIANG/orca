import { create } from 'zustand'

// Why localStorage: a per-device layout preference, kept out of the synced persisted-UI schema.
const STORAGE_KEY = 'orca.bottomPanel'
const DEFAULT_HEIGHT = 260
export const MIN_BOTTOM_PANEL_HEIGHT = 120
// Share of the window the panel may take, so the workspace above stays usable.
export const MAX_BOTTOM_PANEL_HEIGHT_RATIO = 0.75

export type BottomPanelTab = 'run' | 'git'

type PersistedBottomPanel = { open: boolean; height: number; tab: BottomPanelTab }

type BottomPanelState = PersistedBottomPanel & {
  setOpen: (open: boolean) => void
  toggle: () => void
  setHeight: (height: number) => void
  /** Opens the panel on `tab`. */
  show: (tab: BottomPanelTab) => void
  setTab: (tab: BottomPanelTab) => void
}

function readPersisted(): PersistedBottomPanel {
  const fallback: PersistedBottomPanel = { open: false, height: DEFAULT_HEIGHT, tab: 'run' }
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage?.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') {
      return fallback
    }
    const open = 'open' in parsed && typeof parsed.open === 'boolean' ? parsed.open : false
    const height =
      'height' in parsed && typeof parsed.height === 'number' && Number.isFinite(parsed.height)
        ? Math.max(MIN_BOTTOM_PANEL_HEIGHT, parsed.height)
        : DEFAULT_HEIGHT
    const tab = 'tab' in parsed && parsed.tab === 'git' ? 'git' : 'run'
    return { open, height, tab }
  } catch {
    return fallback
  }
}

export const useBottomPanelState = create<BottomPanelState>((set) => ({
  ...readPersisted(),
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  setHeight: (height) => set({ height: Math.max(MIN_BOTTOM_PANEL_HEIGHT, Math.round(height)) }),
  show: (tab) => set({ open: true, tab }),
  setTab: (tab) => set({ tab })
}))

/** Whether the docked run group is on screen; its terminals hide (but keep running) otherwise. */
export function selectRunPanelVisible(state: PersistedBottomPanel): boolean {
  return state.open && state.tab === 'run'
}

useBottomPanelState.subscribe((state, previous) => {
  if (
    state.open === previous.open &&
    state.height === previous.height &&
    state.tab === previous.tab
  ) {
    return
  }
  try {
    window.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ open: state.open, height: state.height, tab: state.tab })
    )
  } catch {
    // Storage full or unavailable; the panel still works for this session.
  }
})
