import './assets/main.css'

import { StrictMode, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from './components/confirmation-dialog'
import { DetachedPageRoot } from './components/detached-pages/DetachedPageRoot'
import { currentDetachedPage } from './components/detached-pages/detached-page-location'
import { RecoverableRenderErrorBoundary } from './components/error-boundaries/RecoverableRenderErrorBoundary'
import { applyDocumentTheme } from './app-shell/appearance/document-theme'
import { resolvePaintedTheme } from './app-shell/appearance/terminal-app-theme'
import { buildAppFontFamily } from './app-shell/appearance/app-font-family'
import { applyCodeFontSmoothing } from './lib/editor/appearance/code-font-smoothing'
import { getOrCreateRendererRoot } from './app-shell/startup/react-renderer-root'
import { installOsFileDropCancellationGuard } from './lib/files/drop/os-file-drop-cancellation-guard'
import { installBodyOverlayAttributes } from './lib/body-overlay-attributes'
import { useReduceVisualEffects } from './hooks/use-reduce-visual-effects'
import { I18nProvider } from './i18n/I18nProvider'
import { translate } from './i18n/i18n'
import { useAppStore } from './store'
import type { GlobalSettings } from '../../shared/global-settings-types'

const disposeOsFileDropGuard = installOsFileDropCancellationGuard()
import.meta.hot?.dispose(disposeOsFileDropGuard)
const disposeBodyOverlayAttributes = installBodyOverlayAttributes()
import.meta.hot?.dispose(disposeBodyOverlayAttributes)

function applyAppearance(settings: GlobalSettings | null): void {
  applyDocumentTheme(resolvePaintedTheme(settings), { disableTransitions: false })
  document.documentElement.style.setProperty(
    '--app-font-family',
    buildAppFontFamily(settings?.appFontFamily)
  )
  applyCodeFontSmoothing(settings?.codeFontSmoothing)
}

// Seed this window's own store synchronously so the theme doesn't flash before hydration.
let startupSettings: GlobalSettings | null = null
try {
  startupSettings = window.api.settings.getSync()
} catch {
  // The async read below still hydrates settings.
}
if (startupSettings) {
  useAppStore.setState({ settings: startupSettings })
}
applyAppearance(startupSettings)

// Mirrors the dashboard popout's settings sync: this window has no App shell to do it.
function SettingsSync(): null {
  const settings = useAppStore((state) => state.settings)
  useReduceVisualEffects(settings?.reduceVisualEffects)

  useEffect(() => {
    let disposed = false
    void useAppStore.getState().fetchKeybindings()
    const setSettings = (next: GlobalSettings): void => {
      if (!disposed) {
        useAppStore.setState({ settings: next })
      }
    }
    const offChanged = window.api.settings.onChanged((updates) => {
      const current = useAppStore.getState().settings
      if (current) {
        setSettings({ ...current, ...updates })
      }
    })
    void window.api.settings
      .get()
      .then(setSettings)
      .catch(() => undefined)
    return () => {
      disposed = true
      offChanged()
    }
  }, [])

  useEffect(() => {
    applyAppearance(settings)
    if (settings?.theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (): void => applyDocumentTheme(resolvePaintedTheme(settings))
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [settings])

  return null
}

const page = currentDetachedPage()
const rootElement = document.getElementById('root')
if (!rootElement || !page) {
  throw new Error('Detached page root or page id not found.')
}

getOrCreateRendererRoot(rootElement, import.meta.hot?.data).render(
  <StrictMode>
    <I18nProvider>
      <SettingsSync />
      <RecoverableRenderErrorBoundary
        boundaryId="detached-page.root"
        surface="page"
        title={translate('auto.components.detachedPages.errorTitle', 'This window hit an error.')}
        description={translate(
          'auto.components.detachedPages.errorDescription',
          'Retry, or close the window and open the page again.'
        )}
      >
        <TooltipProvider delayDuration={400}>
          <ConfirmationDialogProvider>
            <div className="app-layout">
              <DetachedPageRoot page={page} />
            </div>
          </ConfirmationDialogProvider>
          <Toaster closeButton toastOptions={{ className: 'font-sans text-sm' }} />
        </TooltipProvider>
      </RecoverableRenderErrorBoundary>
    </I18nProvider>
  </StrictMode>
)
