import { describe, expect, it } from 'vitest'
import { COLORS, DEFAULT_COLOR } from './colors'

describe('colors', () => {
  it('has 16 colors whose ids match their index', () => {
    expect(COLORS).toHaveLength(16)
    COLORS.forEach((c, i) => expect(c.id).toBe(i))
  })

  it('uses valid hex values and bilingual names', () => {
    for (const c of COLORS) {
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/)
      expect(c.name.vi).not.toBe('')
      expect(c.name.en).not.toBe('')
    }
  })

  it('only the last color is glass', () => {
    expect(COLORS.filter((c) => c.glass).map((c) => c.id)).toEqual([15])
  })

  it('defaults to red', () => {
    expect(COLORS[DEFAULT_COLOR].name.en).toBe('Red')
  })
})
