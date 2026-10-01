import { useEffect, useState } from 'react'
import App from '../App'
import { startAutosave } from '../persistence/autosave'
import { loadCurrentSlot } from '../persistence/session'
import { useGame } from '../state/useGame'
import { useT } from './i18n'

/** Loads the current slot, shows a loading screen until ready, runs autosave, then renders the app. */
export default function Boot() {
  const t = useT()
  const loaded = useGame((s) => s.loaded)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let stop: (() => void) | undefined
    loadCurrentSlot()
      .then(() => {
        if (!cancelled) stop = startAutosave()
      })
      .catch((e) => {
        console.error('bricktown: boot failed', e)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  if (failed) {
    return (
      <div className="bt-screen bt-placeholder" data-testid="boot-error" role="alert">
        <span>⚠️ {t('bootError')}</span>
        <button className="bt-btn" data-testid="boot-reload" onClick={() => window.location.reload()}>
          🔄 {t('reload')}
        </button>
      </div>
    )
  }
  if (!loaded) {
    return (
      <div className="bt-screen bt-placeholder" data-testid="loading">
        🧱 {t('loading')}
      </div>
    )
  }
  return <App />
}
