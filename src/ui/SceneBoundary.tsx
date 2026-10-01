import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { useApp } from '../state/useApp'
import { useT } from './i18n'
import { resetFailedScenes } from './lazyScene'
import SceneLoading from './SceneLoading'

/** Friendly screen when a scene fails: back to the menu, or reload the app. */
function SceneError() {
  const t = useT()
  const setMode = useApp((s) => s.setMode)
  const goHome = () => setMode('menu') // entering the scene again retries the download (retryFailedScenesOnMenu)
  return (
    <div className="bt-screen bt-placeholder" data-testid="scene-error" role="alert">
      <span className="bt-scene-error-icon" aria-hidden="true">🧱💥</span>
      <span>{t('sceneError')}</span>
      <div className="bt-scene-error-actions">
        <button className="bt-btn bt-icon-btn" data-testid="scene-error-menu" aria-label={t('back')} onClick={goHome}>
          🏠
        </button>
        <button className="bt-btn bt-icon-btn" data-testid="scene-error-reload" aria-label={t('reload')} onClick={() => window.location.reload()}>
          🔄
        </button>
      </div>
    </div>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('bricktown: scene failed', error, info.componentStack)
  }

  render() {
    return this.state.failed ? <SceneError /> : this.props.children
  }
}

/**
 * Forgets failed scene loads whenever the app returns to the main menu, by any route (the error
 * screen's 🏠 or the top bar ←), so entering a scene again always retries its download.
 * Returns an unsubscribe.
 */
export function retryFailedScenesOnMenu(): () => void {
  return useApp.subscribe((s, prev) => {
    if (s.mode === 'menu' && prev.mode !== 'menu') resetFailedScenes()
  })
}

/**
 * Wraps a lazy-loaded scene: a loading screen while its code (and for drive, the physics engine)
 * downloads, and a friendly error screen instead of a blank app if loading or rendering it fails.
 */
export default function SceneBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<SceneLoading />}>{children}</Suspense>
    </ErrorBoundary>
  )
}
