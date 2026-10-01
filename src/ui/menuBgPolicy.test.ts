import { describe, expect, it } from 'vitest'
import { canAnimateMenuBg } from './menuBgPolicy'

describe('canAnimateMenuBg', () => {
  it('plays on a capable device', () => {
    expect(canAnimateMenuBg({ reducedMotion: false, cores: 8, memoryGb: 4 })).toBe(true)
    expect(canAnimateMenuBg({ reducedMotion: false })).toBe(true) // unknown hardware (Safari)
  })

  it('keeps the poster for reduced motion and low-power devices', () => {
    expect(canAnimateMenuBg({ reducedMotion: true, cores: 8 })).toBe(false)
    expect(canAnimateMenuBg({ reducedMotion: false, cores: 4 })).toBe(false)
    expect(canAnimateMenuBg({ reducedMotion: false, cores: 8, memoryGb: 2 })).toBe(false)
  })
})
