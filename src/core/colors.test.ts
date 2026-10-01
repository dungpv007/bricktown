import { describe, expect, it } from 'vitest'
import { COLORS, DEFAULT_COLOR, colorMaterialKind } from './colors'

describe('colors', () => {
  it('has 30 colors whose ids match their index', () => {
    expect(COLORS).toHaveLength(30)
    COLORS.forEach((c, i) => expect(c.id).toBe(i))
  })

  it('uses valid hex values and bilingual names', () => {
    for (const c of COLORS) {
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/)
      expect(c.name.vi).not.toBe('')
      expect(c.name.en).not.toBe('')
    }
  })

  it('keeps the save-format meaning of ids 0-15', () => {
    expect(COLORS.slice(0, 16).map((c) => c.hex)).toEqual([
      '#F4F4F4', '#1B2A34', '#C91A09', '#0055BF', '#F2CD37', '#237841', '#FE8A18', '#A0A5A9',
      '#6C6E68', '#583927', '#E4CD9E', '#BBE90B', '#FC97AC', '#81007B', '#36AEBF', '#CFE8F0',
    ])
  })

  it('appends the new colours with their exact hexes', () => {
    expect(COLORS.slice(16).map((c) => [c.id, c.hex])).toEqual([
      [16, '#C91A09'], [17, '#0055BF'], [18, '#F5CD2F'], [19, '#237841'], [20, '#F08F1C'],
      [21, '#0A3463'], [22, '#720E0F'], [23, '#5A93DB'], [24, '#C8C8C8'], [25, '#958A73'],
      [26, '#A0BCAC'], [27, '#E1D5ED'], [28, '#A5A9B4'], [29, '#DBAC34'],
    ])
  })

  it('glass (15) and the trans colours (16-20) are transparent; silver and gold are metal', () => {
    expect(COLORS.filter((c) => c.trans).map((c) => c.id)).toEqual([15, 16, 17, 18, 19, 20])
    expect(COLORS.filter((c) => c.metal).map((c) => c.id)).toEqual([28, 29])
    expect(COLORS.some((c) => c.trans && c.metal)).toBe(false)
  })

  it('maps each colour to the material kind it renders with', () => {
    expect(colorMaterialKind(2)).toBe('opaque')
    expect(colorMaterialKind(24)).toBe('opaque')
    expect(colorMaterialKind(15)).toBe('trans')
    expect(colorMaterialKind(17)).toBe('trans')
    expect(colorMaterialKind(28)).toBe('metal')
    expect(colorMaterialKind(29)).toBe('metal')
    // An unknown index (e.g. a hand-edited save) renders as a plain opaque brick.
    expect(colorMaterialKind(99)).toBe('opaque')
  })

  it('defaults to red', () => {
    expect(COLORS[DEFAULT_COLOR].name.en).toBe('Red')
  })
})
