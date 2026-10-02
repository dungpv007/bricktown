import { useApp } from '../state/useApp'
import { resolveAutoPreset, type GraphicsLevel, type GraphicsPreset, type GraphicsToggles } from '../state/graphics'
import { deviceSignals, useGraphicsToggles } from '../state/useGraphics'
import { useT, type TKey } from './i18n'

const LEVEL_ICON: Record<GraphicsLevel, string> = { battery: '🔋', balanced: '⚖️', best: '✨' }
const LEVEL_KEY: Record<GraphicsLevel, TKey> = { battery: 'gfxBattery', balanced: 'gfxBalanced', best: 'gfxBest' }
const PRESETS: Array<{ id: Exclude<GraphicsPreset, 'custom'>; icon: string; key: TKey }> = [
  { id: 'auto', icon: '🤖', key: 'gfxAuto' },
  { id: 'battery', icon: LEVEL_ICON.battery, key: LEVEL_KEY.battery },
  { id: 'balanced', icon: LEVEL_ICON.balanced, key: LEVEL_KEY.balanced },
  { id: 'best', icon: LEVEL_ICON.best, key: LEVEL_KEY.best },
]

type Choice<K extends keyof GraphicsToggles> = { value: GraphicsToggles[K]; label: TKey | string }

interface Row<K extends keyof GraphicsToggles = keyof GraphicsToggles> {
  key: K
  icon: string
  label: TKey
  choices: Array<Choice<K>>
}

const ON_OFF: Array<Choice<'water'>> = [
  { value: false, label: 'soundOff' },
  { value: true, label: 'soundOn' },
]

const ROWS: Row[] = [
  { key: 'shadows', icon: '🌗', label: 'gfxShadows', choices: [{ value: 'off', label: 'soundOff' }, { value: 'low', label: 'gfxLow' }, { value: 'high', label: 'gfxHigh' }] },
  { key: 'resolution', icon: '🔍', label: 'gfxResolution', choices: [{ value: 'low', label: 'gfxLow' }, { value: 'mid', label: 'gfxMid' }, { value: 'high', label: 'gfxHigh' }] },
  { key: 'fps', icon: '🎞️', label: 'gfxFps', choices: [{ value: 30, label: '30' }, { value: 60, label: '60' }] },
  { key: 'npc', icon: '🚗', label: 'gfxNpc', choices: [{ value: 'off', label: 'soundOff' }, { value: 'few', label: 'gfxFew' }, { value: 'many', label: 'gfxMany' }] },
  { key: 'water', icon: '🌊', label: 'gfxWater', choices: ON_OFF },
  { key: 'horizon', icon: '⛰️', label: 'gfxHorizon', choices: ON_OFF },
  { key: 'autoDayNight', icon: '🌙', label: 'gfxDayNight', choices: ON_OFF },
  { key: 'farStuds', icon: '🧱', label: 'gfxFarStuds', choices: ON_OFF },
] as Row[]

/**
 * The "Đồ họa" settings: a preset (Tự động, 🔋 Tiết kiệm pin, ⚖️ Cân bằng, ✨ Đẹp nhất) and, under it,
 * every switch it stands for; changing one makes the preset "Tùy chỉnh". Saved with the preferences.
 */
export default function GraphicsSettings() {
  const t = useT()
  const preset = useApp((s) => s.graphicsPreset)
  const toggles = useGraphicsToggles()
  const autoLevel = resolveAutoPreset(deviceSignals())
  const label = (l: TKey | string) => (/^\d+$/.test(l) ? l : t(l as TKey))

  return (
    <div className="bt-gfx" data-testid="graphics-settings">
      <div className="bt-gfx-presets" role="group" aria-label={t('graphicsSettings')}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="bt-btn bt-gfx-preset"
            data-testid={`graphics-preset-${p.id}`}
            aria-pressed={preset === p.id}
            onClick={() => useApp.getState().setGraphicsPreset(p.id)}
          >
            <span className="bt-gfx-preset-icon" aria-hidden="true">
              {p.icon}
            </span>
            <span>{t(p.key)}</span>
            {p.id === 'auto' && (
              <small className="bt-gfx-auto-pick" data-testid="graphics-auto-pick">
                {LEVEL_ICON[autoLevel]} {t(LEVEL_KEY[autoLevel])}
              </small>
            )}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <p className="bt-gfx-custom" data-testid="graphics-custom">
          🛠️ {t('gfxCustom')}
        </p>
      )}
      <div className="bt-gfx-rows">
        {ROWS.map((row) => (
          <div className="bt-gfx-row" key={row.key}>
            <span className="bt-gfx-label">
              <span aria-hidden="true">{row.icon}</span> {t(row.label)}
            </span>
            <div className="bt-gfx-choices" role="group" aria-label={t(row.label)}>
              {row.choices.map((c) => (
                <button
                  key={String(c.value)}
                  className="bt-btn bt-gfx-choice"
                  data-testid={`graphics-${row.key}-${String(c.value)}`}
                  aria-pressed={toggles[row.key] === c.value}
                  onClick={() => {
                    if (toggles[row.key] === c.value) return
                    useApp.getState().setGraphicsCustom({ ...toggles, [row.key]: c.value })
                  }}
                >
                  {label(c.label)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
