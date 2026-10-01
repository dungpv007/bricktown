import { describe, expect, it } from 'vitest'
import { sanitizePrefs, useApp } from './useApp'

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
})

describe('useApp persistence config', () => {
  const opts = useApp.persist.getOptions()
  it('persists slotId, lang, difficulty and the two sound toggles only', () => {
    const state = useApp.getState()
    expect(opts.partialize?.(state)).toEqual({ lang: 'vi', difficulty: 'easy', slotId: 1, musicOn: true, sfxOn: true })
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
})
