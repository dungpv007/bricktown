import { useState } from 'react'
import type { Mode } from '../state/useApp'
import { useApp } from '../state/useApp'
import { useT, type TKey } from './i18n'
import SlotMenu from './SlotMenu'

type PlayMode = Exclude<Mode, 'menu'>

const CARDS: Array<{ mode: PlayMode; labelKey: TKey; icon: string; color: string }> = [
  { mode: 'workshop', labelKey: 'menuWorkshop', icon: '🧱', color: 'var(--bt-red)' },
  { mode: 'guided', labelKey: 'menuGuided', icon: '📋', color: 'var(--bt-blue)' },
  { mode: 'city', labelKey: 'menuCity', icon: '🏙️', color: 'var(--bt-green)' },
  { mode: 'drive', labelKey: 'menuDrive', icon: '🚗', color: 'var(--bt-orange)' },
]

export default function MainMenu() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const setLang = useApp((s) => s.setLang)
  const setMode = useApp((s) => s.setMode)
  const [slotsOpen, setSlotsOpen] = useState(false)

  return (
    <div className="bt-screen bt-menu" data-testid="main-menu">
      <h1 className="bt-title">{t('appTitle')}</h1>
      <div className="bt-cards">
        {CARDS.map((c) => (
          <button
            key={c.mode}
            className="bt-card"
            style={{ background: c.color }}
            data-testid={`menu-${c.mode}`}
            onClick={() => setMode(c.mode)}
          >
            <span className="bt-card-icon" aria-hidden="true">{c.icon}</span>
            {t(c.labelKey)}
          </button>
        ))}
      </div>
      <div className="bt-row">
        <button
          className="bt-btn"
          data-testid="lang-toggle"
          aria-label={t('language')}
          onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
        >
          🌐 {lang === 'vi' ? 'VI' : 'EN'}
        </button>
        <button
          className="bt-btn"
          data-testid="settings"
          aria-label={t('menuSettings')}
          onClick={() => setSlotsOpen(true)}
        >
          ⚙️ {t('slot')}
        </button>
      </div>
      {slotsOpen && <SlotMenu onClose={() => setSlotsOpen(false)} />}
    </div>
  )
}
