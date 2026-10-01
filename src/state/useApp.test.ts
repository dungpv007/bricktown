import { describe, expect, it } from 'vitest'
import { sanitizePrefs, useApp } from './useApp'

describe('sanitizePrefs', () => {
  it('keeps valid persisted values including the slot', () => {
    expect(sanitizePrefs({ lang: 'en', difficulty: 'normal', slotId: 3, muted: true })).toEqual({
      lang: 'en',
      difficulty: 'normal',
      slotId: 3,
      muted: true,
    })
  })
  it('drops invalid values so defaults apply', () => {
    expect(sanitizePrefs({ lang: 'fr', difficulty: 'hard', slotId: 4 })).toEqual({})
    expect(sanitizePrefs({ lang: 5, difficulty: null, slotId: '2', muted: 'yes' })).toEqual({})
    expect(sanitizePrefs({ muted: 1 })).toEqual({})
    expect(sanitizePrefs(null)).toEqual({})
    expect(sanitizePrefs('x')).toEqual({})
  })
})

describe('useApp persistence config', () => {
  const opts = useApp.persist.getOptions()
  it('persists slotId, lang, difficulty and muted only', () => {
    const state = useApp.getState()
    expect(opts.partialize?.(state)).toEqual({ lang: 'vi', difficulty: 'easy', slotId: 1, muted: false })
  })
  it('merge falls back to defaults for bad persisted values', () => {
    const current = useApp.getState()
    const merged = opts.merge?.({ lang: 'xx', slotId: 2, difficulty: 'bad' }, current)
    expect(merged).toMatchObject({ lang: 'vi', slotId: 2, difficulty: 'easy' })
  })
  it('merge keeps a persisted mute and ignores a non-boolean one', () => {
    const current = useApp.getState()
    expect(opts.merge?.({ muted: true }, current)).toMatchObject({ muted: true })
    expect(opts.merge?.({ muted: 'true' }, current)).toMatchObject({ muted: false })
  })
})
