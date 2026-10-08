import { create } from 'zustand'

// Why localStorage: a per-device layout preference, kept out of the synced persisted-UI schema.
const STORAGE_KEY = 'orca.bottomPanel'
const DEFAULT_HEIGHT = 260
export const MIN_BOTTOM_PANEL_HEIGHT = 120
// Share of the window the panel may take, so the workspace above stays usable.
export const MAX_BOTTOM_PANEL_HEIGHT_RATIO = 0.75

type PersistedBottomPanel = { open: boolean; height: number }

type BottomPanelState = PersistedBottomPanel & {
  setOpen: (open: boolean) => void
  toggle: () => void
  setHeight: (height: number) => void
}

function readPersisted(): PersistedBottomPanel {
  const fallback = { open: false, height: DEFAULT_HEIGHT }
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
    return { open, height }
  } catch {
    return fallback
  }
}

export const useBottomPanelState = create<BottomPanelState>((set) => ({
  ...readPersisted(),
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  setHeight: (height) => set({ height: Math.max(MIN_BOTTOM_PANEL_HEIGHT, Math.round(height)) })
}))

useBottomPanelState.subscribe((state, previous) => {
  if (state.open === previous.open && state.height === previous.height) {
    return
  }
  try {
    window.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ open: state.open, height: state.height })
    )
  } catch {
    // Storage full or unavailable; the panel still works for this session.
  }
})
