import type { TKey } from './i18n'
import { useT } from './i18n'
import { useApp } from '../state/useApp'

export default function TopBar({ titleKey }: { titleKey: TKey }) {
  const t = useT()
  const setMode = useApp((s) => s.setMode)
  return (
    <div className="bt-topbar">
      <button className="bt-btn" data-testid="back" aria-label={t('back')} onClick={() => setMode('menu')}>
        ←
      </button>
      <span className="bt-topbar-title" data-testid="mode-title">
        {t(titleKey)}
      </span>
    </div>
  )
}
