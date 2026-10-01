import type { TKey } from './i18n'
import { useT } from './i18n'
import { useApp } from '../state/useApp'
import SaveWarning from './SaveWarning'

/** `onBack` replaces the default "back to the main menu" (e.g. from an editor back to its picker). */
export default function TopBar({ titleKey, onBack }: { titleKey: TKey; onBack?: () => void }) {
  const t = useT()
  const setMode = useApp((s) => s.setMode)
  return (
    <div className="bt-topbar">
      <button className="bt-btn" data-testid="back" aria-label={t('back')} onClick={onBack ?? (() => setMode('menu'))}>
        ←
      </button>
      <span className="bt-topbar-title" data-testid="mode-title">
        {t(titleKey)}
      </span>
      <SaveWarning />
    </div>
  )
}
