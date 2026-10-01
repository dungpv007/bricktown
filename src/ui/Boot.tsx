import { useEffect } from 'react'
import App from '../App'
import { startAutosave } from '../persistence/autosave'
import { loadCurrentSlot } from '../persistence/session'
import { useGame } from '../state/useGame'
import { useT } from './i18n'

/** Loads the current slot, shows a loading screen until ready, runs autosave, then renders the app. */
export default function Boot() {
  const t = useT()
  const loaded = useGame((s) => s.loaded)

  useEffect(() => {
    let cancelled = false
    let stop: (() => void) | undefined
    void loadCurrentSlot().then(() => {
      if (!cancelled) stop = startAutosave()
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  if (!loaded) {
    return (
      <div className="bt-screen bt-placeholder" data-testid="loading">
        🧱 {t('loading')}
      </div>
    )
  }
  return <App />
}
