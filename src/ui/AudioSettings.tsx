import { useEffect, useRef, type CSSProperties } from 'react'
import { primeMusic } from '../audio/music'
import { snap } from '../audio/sfx'
import { useApp } from '../state/useApp'
import { useT } from './i18n'

/** The preview click after letting go of the effects slider is played at most this often (ms). */
const PREVIEW_GAP_MS = 250

interface RowProps {
  testId: string
  icon: string
  label: string
  sliderLabel: string
  on: boolean
  volume: number
  onToggle: () => void
  onVolume: (volume: number) => void
  /** Let go of the slider (pointer up / key up). */
  onRelease?: () => void
}

/** One sound: an on/off button with its name, and a big slider (🔈 quiet .. 🔊 loud) under it. */
function SoundRow({ testId, icon, label, sliderLabel, on, volume, onToggle, onVolume, onRelease }: RowProps) {
  const t = useT()
  const percent = Math.round(volume * 100)
  return (
    <div className="bt-audio-row">
      <button className="bt-btn bt-audio-toggle" data-testid={`audio-${testId}-on`} aria-pressed={on} onClick={onToggle}>
        <span className="bt-audio-icon" aria-hidden="true" style={on ? undefined : { opacity: 0.35 }}>
          {icon}
        </span>
        <span className="bt-audio-label">{label}</span>
        <small className="bt-audio-state">{on ? t('soundOn') : t('soundOff')}</small>
      </button>
      <div className="bt-audio-slider" data-disabled={!on}>
        <span aria-hidden="true">🔈</span>
        <input
          type="range"
          className="bt-range"
          data-testid={`${testId}-volume`}
          aria-label={sliderLabel}
          min={0}
          max={100}
          step={5}
          value={percent}
          disabled={!on}
          style={{ '--bt-range-pct': percent / 100 } as CSSProperties}
          onChange={(e) => onVolume(Number(e.currentTarget.value) / 100)}
          onPointerUp={onRelease}
          onPointerCancel={onRelease}
          onKeyUp={onRelease}
        />
        <span aria-hidden="true">🔊</span>
      </div>
    </div>
  )
}

/**
 * The "Sound" dialog: on/off and volume for the music and for the sound effects. The toggles are the
 * same switches as the 🎵 and 🔊 buttons of the main menu, which stay in sync with them.
 */
export default function AudioSettings({ onClose }: { onClose: () => void }) {
  const t = useT()
  const musicOn = useApp((s) => s.musicOn)
  const sfxOn = useApp((s) => s.sfxOn)
  const musicVolume = useApp((s) => s.musicVolume)
  const sfxVolume = useApp((s) => s.sfxVolume)
  const lastPreview = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const preview = () => {
    const now = Date.now()
    if (now - lastPreview.current < PREVIEW_GAP_MS) return
    lastPreview.current = now
    snap()
  }

  return (
    <div className="bt-modal" data-testid="audio-settings-dialog" role="presentation" onClick={onClose}>
      <div
        className="bt-panel bt-audio-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('soundSettings')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bt-row bt-panel-head">
          <h2 className="bt-panel-title">🎚️ {t('soundSettings')}</h2>
          <button className="bt-btn" data-testid="audio-settings-close" aria-label={t('close')} onClick={onClose}>
            ✕
          </button>
        </div>
        <SoundRow
          testId="music"
          icon="🎵"
          label={t('music')}
          sliderLabel={t('musicVolume')}
          on={musicOn}
          volume={musicVolume}
          onToggle={() => {
            useApp.getState().setMusicOn(!musicOn)
            if (!musicOn) primeMusic() // switching on: start it inside this tap (iOS)
          }}
          onVolume={(v) => {
            useApp.getState().setMusicVolume(v)
            primeMusic() // a gesture: starts the music if it was not playing yet (iOS)
          }}
        />
        <SoundRow
          testId="sfx"
          icon="🔔"
          label={t('effectsShort')}
          sliderLabel={t('sfxVolume')}
          on={sfxOn}
          volume={sfxVolume}
          onToggle={() => {
            useApp.getState().setSfxOn(!sfxOn)
            if (!sfxOn) snap() // switching on: confirm with a sound
          }}
          onVolume={(v) => useApp.getState().setSfxVolume(v)}
          onRelease={preview}
        />
      </div>
    </div>
  )
}
