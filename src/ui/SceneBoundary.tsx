import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { useApp } from '../state/useApp'
import { useT } from './i18n'
import SceneLoading from './SceneLoading'

/** Friendly screen when a scene fails: back to the menu, or reload the app. */
function SceneError() {
  const t = useT()
  const setMode = useApp((s) => s.setMode)
  return (
    <div className="bt-screen bt-placeholder" data-testid="scene-error" role="alert">
      <span className="bt-scene-error-icon" aria-hidden="true">🧱💥</span>
      <span>{t('sceneError')}</span>
      <div className="bt-scene-error-actions">
        <button className="bt-btn bt-icon-btn" data-testid="scene-error-menu" aria-label={t('back')} onClick={() => setMode('menu')}>
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
