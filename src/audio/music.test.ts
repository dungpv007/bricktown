import { describe, expect, it } from 'vitest'
import { MUSIC_MAX, musicLevel } from './music'

describe('musicLevel', () => {
  it('scales the volume slider to MUSIC_MAX, so the default 0.5 is the original 0.35', () => {
    expect(MUSIC_MAX).toBe(0.7)
    expect(musicLevel(0.5)).toBeCloseTo(0.35)
    expect(musicLevel(1)).toBeCloseTo(0.7)
    expect(musicLevel(0)).toBe(0)
  })
  it('clamps out-of-range values', () => {
    expect(musicLevel(3)).toBeCloseTo(0.7)
    expect(musicLevel(-0.5)).toBe(0)
  })
})
