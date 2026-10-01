import { useEffect, useState } from 'react'
import App from '../App'
import { startAutosave } from '../persistence/autosave'
import { loadCurrentSlot } from '../persistence/session'
import { useGame } from '../state/useGame'
import { useT } from './i18n'
import ShareImportHost from './share/ShareImportHost'

/** Loads the current slot, shows a loading screen until ready, runs autosave, then renders the app (and receives shares). */
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
  return (
    <>
      <App />
      {/* After the save is loaded: a share link (#s=) is previewed against it, never applied on its own. */}
      <ShareImportHost />
    </>
  )
}
