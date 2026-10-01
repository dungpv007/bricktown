import { useApp } from '../../state/useApp'
import { useT } from '../../ui/i18n'

/** Stands in for driving through the maze until that mode exists; goes back to the editor. */
export default function MazeDrivePlaceholder() {
  const t = useT()
  const setMode = useApp((s) => s.setMode)
  return (
    <div className="bt-screen bt-placeholder" data-testid="maze-drive-placeholder">
      <span className="bt-card-icon" aria-hidden="true">🚧🚗🌀</span>
      <p>{t('mazeDriveSoon')}</p>
      <button className="bt-btn" data-testid="maze-drive-back" aria-label={t('back')} onClick={() => setMode('maze')}>
        ← 🌀
      </button>
    </div>
  )
}
