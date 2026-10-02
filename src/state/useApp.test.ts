import { describe, expect, it } from 'vitest'
import { colorsCollapsed, DEFAULT_VOLUME, normalizeVolume, sanitizePrefs, useApp } from './useApp'

describe('sanitizePrefs', () => {
  it('keeps valid persisted values including the slot and both sound toggles', () => {
    expect(sanitizePrefs({ lang: 'en', difficulty: 'normal', slotId: 3, musicOn: false, sfxOn: true })).toEqual({
      lang: 'en',
      difficulty: 'normal',
      slotId: 3,
      musicOn: false,
      sfxOn: true,
    })
  })
  it('drops invalid values so defaults apply', () => {
    expect(sanitizePrefs({ lang: 'fr', difficulty: 'hard', slotId: 4 })).toEqual({})
    expect(sanitizePrefs({ lang: 5, difficulty: null, slotId: '2', musicOn: 'yes', sfxOn: 0 })).toEqual({})
    expect(sanitizePrefs({ muted: 1 })).toEqual({})
    expect(sanitizePrefs(null)).toEqual({})
    expect(sanitizePrefs('x')).toEqual({})
  })
  it('migrates the old single mute: muted turns music and sound effects off', () => {
    expect(sanitizePrefs({ muted: true })).toEqual({ musicOn: false, sfxOn: false })
    expect(sanitizePrefs({ muted: false })).toEqual({ musicOn: true, sfxOn: true })
  })
  it('prefers the new toggles over the old mute', () => {
    expect(sanitizePrefs({ muted: true, musicOn: true })).toEqual({ musicOn: true, sfxOn: false })
    expect(sanitizePrefs({ muted: true, musicOn: 'x', sfxOn: true })).toEqual({ musicOn: false, sfxOn: true })
  })
  it('keeps the colour picker state of known device classes only', () => {
    expect(sanitizePrefs({ colorsCollapsed: { phonePortrait: false, tablet: true } })).toEqual({
      colorsCollapsed: { phonePortrait: false, tablet: true },
    })
    expect(sanitizePrefs({ colorsCollapsed: { phoneLandscape: 'yes', watch: true, tablet: false } })).toEqual({
      colorsCollapsed: { tablet: false },
    })
    expect(sanitizePrefs({ colorsCollapsed: [true] })).toEqual({ colorsCollapsed: {} })
    expect(sanitizePrefs({ colorsCollapsed: 'collapsed' })).toEqual({})
  })
})

describe('city life toggle', () => {
  it('is on by default (no reduced motion in node) and keeps a saved boolean only', () => {
    expect(useApp.getState().npcOn).toBe(true)
    expect(sanitizePrefs({ npcOn: false })).toEqual({ npcOn: false })
    expect(sanitizePrefs({ npcOn: 'off' })).toEqual({})
    useApp.getState().setNpcOn(false)
    expect(useApp.getState().npcOn).toBe(false)
    expect(useApp.persist.getOptions().partialize?.(useApp.getState())).toMatchObject({ npcOn: false })
    useApp.getState().setNpcOn(true)
  })
})

describe('volumes', () => {
  it('default to 0.5 (an old save without them loads unchanged)', () => {
    expect(DEFAULT_VOLUME).toBe(0.5)
    expect(useApp.getState().musicVolume).toBe(0.5)
    expect(useApp.getState().sfxVolume).toBe(0.5)
    expect(sanitizePrefs({ lang: 'en', musicOn: false })).toEqual({ lang: 'en', musicOn: false })
    const merged = useApp.persist.getOptions().merge?.({ lang: 'en', musicOn: false }, useApp.getState())
    expect(merged).toMatchObject({ musicVolume: 0.5, sfxVolume: 0.5 })
  })
  it('are clamped to 0..1 and non-numbers fall back to the default', () => {
    expect(normalizeVolume(0.3)).toBe(0.3)
    expect(normalizeVolume(-1)).toBe(0)
    expect(normalizeVolume(7)).toBe(1)
    expect(normalizeVolume('0.2')).toBe(0.5)
    expect(normalizeVolume(NaN)).toBe(0.5)
    expect(normalizeVolume(Infinity)).toBe(0.5)
    expect(normalizeVolume(null, 0.8)).toBe(0.8)
    expect(sanitizePrefs({ musicVolume: 0.2, sfxVolume: 3 })).toEqual({ musicVolume: 0.2, sfxVolume: 1 })
    expect(sanitizePrefs({ musicVolume: -4 })).toEqual({ musicVolume: 0 })
    expect(sanitizePrefs({ musicVolume: '0.2', sfxVolume: null })).toEqual({})
    expect(sanitizePrefs({ musicVolume: NaN })).toEqual({})
  })
  it('the setters store a clamped value', () => {
    const { setMusicVolume, setSfxVolume } = useApp.getState()
    setMusicVolume(0.8)
    setSfxVolume(2)
    expect(useApp.getState().musicVolume).toBe(0.8)
    expect(useApp.getState().sfxVolume).toBe(1)
    setMusicVolume(-1)
    expect(useApp.getState().musicVolume).toBe(0)
    useApp.setState({ musicVolume: 0.5, sfxVolume: 0.5 })
  })
})

describe('colour picker collapse', () => {
  it('defaults to collapsed on portrait phones only, and remembers a choice per device class', () => {
    const initial = useApp.getState().colorsCollapsed
    expect(colorsCollapsed(useApp.getState(), 'phonePortrait')).toBe(true)
    expect(colorsCollapsed(useApp.getState(), 'phoneLandscape')).toBe(false)
    expect(colorsCollapsed(useApp.getState(), 'tablet')).toBe(false)
    useApp.getState().setColorsCollapsed('tablet', true)
    useApp.getState().setColorsCollapsed('phonePortrait', false)
    expect(colorsCollapsed(useApp.getState(), 'tablet')).toBe(true)
    expect(colorsCollapsed(useApp.getState(), 'phonePortrait')).toBe(false)
    expect(colorsCollapsed(useApp.getState(), 'phoneLandscape')).toBe(false)
    useApp.setState({ colorsCollapsed: initial })
  })
})

describe('useApp persistence config', () => {
  const opts = useApp.persist.getOptions()
  it('persists slotId, lang, difficulty, the two sound toggles, their volumes, the colour picker state, city life and graphics only', () => {
    const state = useApp.getState()
    expect(opts.partialize?.(state)).toEqual({
      graphicsPreset: 'auto',
      graphicsCustom: state.graphicsCustom,
      lang: 'vi',
      difficulty: 'easy',
      slotId: 1,
      musicOn: true,
      sfxOn: true,
      musicVolume: 0.5,
      sfxVolume: 0.5,
      colorsCollapsed: {},
      npcOn: true,
    })
  })
  it('merge falls back to defaults for bad persisted values', () => {
    const current = useApp.getState()
    const merged = opts.merge?.({ lang: 'xx', slotId: 2, difficulty: 'bad' }, current)
    expect(merged).toMatchObject({ lang: 'vi', slotId: 2, difficulty: 'easy' })
  })
  it('merge keeps persisted toggles, ignores non-booleans and migrates an old mute', () => {
    const current = useApp.getState()
    expect(opts.merge?.({ musicOn: false }, current)).toMatchObject({ musicOn: false, sfxOn: true })
    expect(opts.merge?.({ sfxOn: 'false' }, current)).toMatchObject({ musicOn: true, sfxOn: true })
    expect(opts.merge?.({ muted: true }, current)).toMatchObject({ musicOn: false, sfxOn: false })
    expect(opts.merge?.({ muted: true }, current)).not.toHaveProperty('muted')
  })
  it('merge keeps a valid graphics preset and cleans the custom toggles', () => {
    const current = useApp.getState()
    expect(opts.merge?.({ graphicsPreset: 'battery' }, current)).toMatchObject({ graphicsPreset: 'battery' })
    expect(opts.merge?.({ graphicsPreset: 'ultra' }, current)).toMatchObject({ graphicsPreset: 'auto' })
    const merged = opts.merge?.({ graphicsPreset: 'custom', graphicsCustom: { fps: 30, shadows: 'nope' } }, current)
    expect(merged).toMatchObject({ graphicsPreset: 'custom', graphicsCustom: { ...current.graphicsCustom, fps: 30 } })
  })
  it('changing one graphics switch makes the preset custom', () => {
    const before = useApp.getState()
    useApp.getState().setGraphicsCustom({ ...before.graphicsCustom, water: false })
    expect(useApp.getState()).toMatchObject({ graphicsPreset: 'custom', graphicsCustom: { water: false } })
    useApp.setState({ graphicsPreset: before.graphicsPreset, graphicsCustom: before.graphicsCustom })
  })
})
