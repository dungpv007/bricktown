import { describe, expect, it } from 'vitest'
import { COLORS, colorMaterialKind } from './colors'
import {
  DEFAULT_FIG,
  FIG_ACCESSORIES,
  FIG_FACES,
  FIG_HATS,
  FIG_PRESETS,
  FIG_PRINTS,
  MINIFIG_PART,
  canonicalFig,
  figColor,
  figKey,
  figOf,
  figPreset,
  isFigColor,
  isFigure,
  parseFig,
  withTorso,
} from './figures'
import { getPart } from './parts/catalog'
import type { Brick, FigStyle } from './types'

const police = (): FigStyle => figPreset('police')

describe('figure presets', () => {
  it('has the police station and restaurant cast, with unique ids and both names', () => {
    const ids = FIG_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([
      'police', 'police_chief', 'robber', 'chef', 'waiter', 'customer', 'customer2',
      'firefighter', 'astronaut', 'construction', 'doctor', 'kid',
    ])
    for (const p of FIG_PRESETS) {
      expect(p.name.vi.length, p.id).toBeGreaterThan(0)
      expect(p.name.en.length, p.id).toBeGreaterThan(0)
    }
  })

  it('every preset is a valid style that survives validation unchanged', () => {
    for (const p of FIG_PRESETS) expect(parseFig(p.style), p.id).toEqual(p.style)
  })

  it('every preset looks different', () => {
    const keys = FIG_PRESETS.map((p) => figKey(p.style))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('figPreset returns a copy and throws for an unknown id', () => {
    const a = figPreset('robber')
    a.torso = 5
    expect(figPreset('robber').torso).not.toBe(5)
    expect(() => figPreset('nope')).toThrow()
  })

  it('the robber wears stripes; police wear the police print and hat', () => {
    expect(figPreset('robber')).toMatchObject({ print: 'stripes', hat: 'robber_cap' })
    expect(figPreset('police')).toMatchObject({ print: 'police', hat: 'police' })
    expect(figPreset('police_chief')).toMatchObject({ print: 'police', hat: 'police' })
  })

  it('the default figure is the first preset', () => {
    expect(DEFAULT_FIG).toEqual(FIG_PRESETS[0].style)
  })
})

describe('figKey', () => {
  it('is stable (saved bakes and caches rely on it)', () => {
    expect(figKey(police())).toBe('21.1.21.smile.police.0.police.radio')
  })

  it('treats omitted optional fields as their defaults', () => {
    const base: FigStyle = { torso: 2, legs: 1, face: 'smile', hat: 'cap', print: 'plain' }
    expect(figKey(base)).toBe(figKey({ ...base, arms: 2, accessory: 'none', hatColor: canonicalFig(base).hatColor }))
    // Without a hat its colour does not matter.
    const bare: FigStyle = { ...base, hat: 'none' }
    expect(figKey({ ...bare, hatColor: 3 })).toBe(figKey({ ...bare, hatColor: 5 }))
  })

  it('changes when any visible field changes', () => {
    const base = police()
    const variants: FigStyle[] = [
      { ...base, torso: 2 },
      { ...base, legs: 2 },
      { ...base, arms: 2 },
      { ...base, face: 'grin' },
      { ...base, hat: 'cap' },
      { ...base, hatColor: 2 },
      { ...base, print: 'plain' },
      { ...base, accessory: 'none' },
    ]
    const keys = new Set([figKey(base), ...variants.map(figKey)])
    expect(keys.size).toBe(variants.length + 1)
  })
})

describe('parseFig', () => {
  it('accepts every option', () => {
    for (const face of FIG_FACES) expect(parseFig({ ...police(), face })?.face).toBe(face)
    for (const hat of FIG_HATS) expect(parseFig({ ...police(), hat })?.hat).toBe(hat)
    for (const print of FIG_PRINTS) expect(parseFig({ ...police(), print })?.print).toBe(print)
    for (const accessory of FIG_ACCESSORIES) expect(parseFig({ ...police(), accessory })?.accessory).toBe(accessory)
  })

  it('rejects anything without a valid torso, legs, face, hat and print', () => {
    expect(parseFig(null)).toBeNull()
    expect(parseFig('police')).toBeNull()
    expect(parseFig([])).toBeNull()
    expect(parseFig({ ...police(), torso: COLORS.length })).toBeNull()
    expect(parseFig({ ...police(), torso: 1.5 })).toBeNull()
    expect(parseFig({ ...police(), legs: -1 })).toBeNull()
    expect(parseFig({ ...police(), face: 'angry' })).toBeNull()
    expect(parseFig({ ...police(), hat: 'wizard' })).toBeNull()
    expect(parseFig({ ...police(), print: 3 })).toBeNull()
    const { face: _face, ...noFace } = police()
    void _face
    expect(parseFig(noFace)).toBeNull()
  })

  it('drops invalid optional fields and unknown keys, keeping the rest', () => {
    const out = parseFig({ ...police(), arms: 99, hatColor: 'blue', accessory: 'sword', extra: 1 })
    const { torso, legs, face, hat, print } = police()
    expect(out).toEqual({ torso, legs, face, hat, print })
  })
})

describe('figure bricks', () => {
  const brick = (fig?: FigStyle): Brick => ({ id: 'f', p: MINIFIG_PART, x: 0, y: 0, z: 0, r: 0, c: 21, ...(fig ? { fig } : {}) })

  it('the minifig part is a 2x1 figure, 12 plates tall, without studs', () => {
    expect(getPart(MINIFIG_PART)).toMatchObject({ category: 'figure', shape: 'minifig', w: 2, d: 1, h: 12, studs: false, sym: 1 })
  })

  it('isFigure tells minifigures from other bricks', () => {
    expect(isFigure(brick())).toBe(true)
    expect(isFigure({ ...brick(), p: 'brick_2x4' })).toBe(false)
  })

  it('figOf falls back to the default figure', () => {
    expect(figOf(brick())).toEqual(DEFAULT_FIG)
    expect(figOf(brick(figPreset('chef')))).toEqual(figPreset('chef'))
  })

  it('figure colours: solids and metals are worn as is, a see-through colour becomes the nearest solid', () => {
    for (const c of COLORS) {
      const kind = colorMaterialKind(c.id)
      expect(isFigColor(c.id)).toBe(kind !== 'trans')
      if (kind !== 'trans') expect(figColor(c.id)).toBe(c.id)
      expect(colorMaterialKind(figColor(c.id))).not.toBe('trans')
    }
    expect([16, 17, 18, 19].map(figColor)).toEqual([2, 3, 4, 5]) // same hex as red, blue, yellow, green
    expect(withTorso(figPreset('chef'), 17).torso).toBe(3)
    // Every ready-made figure and default hat colour follows the rule.
    for (const p of FIG_PRESETS) for (const k of ['torso', 'legs', 'hatColor'] as const) {
      const c = canonicalFig(p.style)[k]
      expect(isFigColor(c), `${p.id}.${k}`).toBe(true)
    }
  })

  it('withTorso recolours only the torso (arms that followed the torso follow it)', () => {
    const chef = figPreset('chef')
    expect(withTorso(chef, 2)).toEqual({ ...chef, torso: 2 })
    const own: FigStyle = { ...chef, arms: 5 }
    expect(withTorso(own, 2)).toEqual({ ...own, torso: 2 })
  })
})
