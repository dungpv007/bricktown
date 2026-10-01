import { useState } from 'react'
import type { Mode } from '../state/useApp'
import { persistWarning, usePersistStatus } from '../persistence/status'
import { primeMusic } from '../audio/music'
import { snap } from '../audio/sfx'
import { useApp } from '../state/useApp'
import { useT, type TKey } from './i18n'
import InstallHint from './InstallHint'
import Onboarding from './Onboarding'
import SlotMenu from './SlotMenu'

type PlayMode = Exclude<Mode, 'menu'>

const CARDS: Array<{ mode: PlayMode; labelKey: TKey; icon: string; color: string }> = [
  { mode: 'workshop', labelKey: 'menuWorkshop', icon: '🧱', color: 'var(--bt-red)' },
  { mode: 'guided', labelKey: 'menuGuided', icon: '📋', color: 'var(--bt-blue)' },
  { mode: 'city', labelKey: 'menuCity', icon: '🏙️', color: 'var(--bt-green)' },
  { mode: 'drive', labelKey: 'menuDrive', icon: '🚗', color: 'var(--bt-orange)' },
  { mode: 'maze', labelKey: 'menuMaze', icon: '🌀', color: 'var(--bt-purple)' },
]

export default function MainMenu() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const setLang = useApp((s) => s.setLang)
  const setMode = useApp((s) => s.setMode)
  const musicOn = useApp((s) => s.musicOn)
  const setMusicOn = useApp((s) => s.setMusicOn)
  const sfxOn = useApp((s) => s.sfxOn)
  const setSfxOn = useApp((s) => s.setSfxOn)
  const saveWarning = usePersistStatus(persistWarning)
  const [slotsOpen, setSlotsOpen] = useState(false)

  return (
    <div className="bt-screen bt-menu" data-testid="main-menu">
      <h1 className="bt-title">{t('appTitle')}</h1>
      <div className="bt-cards bt-menu-cards">
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
        <button
          className="bt-btn"
          data-testid="music-toggle"
          aria-label={t('music')}
          aria-pressed={musicOn}
          onClick={() => {
            setMusicOn(!musicOn)
            if (!musicOn) primeMusic() // switching on: start it inside this tap (iOS)
          }}
        >
          {/* There is no "music off" emoji: the note fades (and the button loses its yellow "on" fill). */}
          <span style={musicOn ? undefined : { opacity: 0.35 }}>🎵</span>
        </button>
        <button
          className="bt-btn"
          data-testid="sfx-toggle"
          aria-label={t('soundEffects')}
          aria-pressed={sfxOn}
          onClick={() => {
            setSfxOn(!sfxOn)
            if (!sfxOn) snap() // switching on: confirm with a sound
          }}
        >
          {sfxOn ? '🔊' : '🔇'}
        </button>
        {saveWarning && (
          <span
            className="bt-warning"
            data-testid="persist-warning"
            role="img"
            aria-label={saveWarning === 'load' ? t('loadWarning') : t('saveFailed')}
          >
            ⚠️
          </span>
        )}
      </div>
      <InstallHint />
      {slotsOpen && <SlotMenu onClose={() => setSlotsOpen(false)} />}
      <Onboarding />
    </div>
  )
}
