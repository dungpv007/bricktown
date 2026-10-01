import { describe, expect, it } from 'vitest'
import { PARTS, PART_BY_ID, PART_CATEGORIES, getPart } from './catalog'

describe('part catalog', () => {
  it('has 41 unique part ids', () => {
    expect(PARTS).toHaveLength(41)
    expect(new Set(PARTS.map((p) => p.id)).size).toBe(41)
  })

  it('every part has w, d, h >= 1 as integers', () => {
    for (const p of PARTS) {
      for (const n of [p.w, p.d, p.h]) {
        expect(Number.isInteger(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('every part category is listed in PART_CATEGORIES', () => {
    for (const p of PARTS) expect(PART_CATEGORIES).toContain(p.category)
    expect(PART_CATEGORIES).toEqual([
      'brick', 'plate', 'slope', 'round', 'door_window', 'wheel', 'furniture', 'nature',
    ])
  })

  it('PART_BY_ID indexes every part', () => {
    expect(Object.keys(PART_BY_ID)).toHaveLength(41)
    for (const p of PARTS) expect(PART_BY_ID[p.id]).toBe(p)
  })

  it('getPart returns a part and throws on unknown id', () => {
    expect(getPart('brick_2x4')).toMatchObject({ w: 2, d: 4, h: 3, studs: true, sym: 2 })
    expect(() => getPart('nope')).toThrow()
  })

  it('matches spec for representative parts', () => {
    expect(getPart('slope_2x4')).toMatchObject({ shape: 'slope', w: 4, d: 2, h: 3, sym: 1 })
    expect(getPart('tile_2x2')).toMatchObject({ shape: 'tile', h: 1, studs: false, sym: 4 })
    expect(getPart('cone_1x1')).toMatchObject({ shape: 'cone', studs: false, sym: 4 })
    expect(getPart('door_1x4x6')).toMatchObject({ w: 4, d: 1, h: 18, sym: 1 })
    expect(getPart('wheel_large')).toMatchObject({ w: 2, d: 3, h: 8, sym: 2, tags: ['wheel'] })
    expect(getPart('lamp_1x1')).toMatchObject({ h: 12, sym: 4 })
    expect(getPart('flower_1x1')).toMatchObject({ category: 'nature', h: 2, sym: 4 })
  })
})
