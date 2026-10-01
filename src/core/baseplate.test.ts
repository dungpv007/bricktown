import { describe, expect, it } from 'vitest'
import {
  BASEPLATE_COLORS, DEFAULT_PLATE_COLOR, PLATE_MAX, PLATE_MIN, PLATE_STEP, canShrink, plateColor, plateShift, resizeBaseplate,
  type PlateSide,
} from './baseplate'
import { COLORS } from './colors'
import type { Baseplate, Brick, Rot } from './types'

const b = (id: string, x: number, y: number, z: number, p = 'brick_2x4', r: Rot = 0): Brick => ({
  id, p, x, y, z, r, c: 3,
})
const bp = (w: number, d: number): Baseplate => ({ w, d })

describe('constants', () => {
  it('grow/shrink in 8-stud steps between 8 and 48 studs', () => {
    expect(PLATE_STEP).toBe(8)
    expect(PLATE_MIN).toBe(8)
    expect(PLATE_MAX).toBe(48)
  })
})

describe('plateShift', () => {
  it('only growing or shrinking the W / N side moves the bricks', () => {
    expect(plateShift('W', 'grow')).toEqual({ dx: 8, dz: 0 })
    expect(plateShift('N', 'grow')).toEqual({ dx: 0, dz: 8 })
    expect(plateShift('W', 'shrink')).toEqual({ dx: -8, dz: 0 })
    expect(plateShift('N', 'shrink')).toEqual({ dx: 0, dz: -8 })
    expect(plateShift('E', 'grow')).toEqual({ dx: 0, dz: 0 })
    expect(plateShift('S', 'shrink')).toEqual({ dx: 0, dz: 0 })
  })
})

describe('resizeBaseplate grow', () => {
  const bricks = [b('a', 0, 0, 0), b('b', 4, 3, 2)]

  it('E grows +X without moving bricks', () => {
    const out = resizeBaseplate(bricks, bp(16, 16), 'E', 'grow')
    expect(out).toEqual({ bricks, baseplate: bp(24, 16) })
  })

  it('S grows +Z without moving bricks', () => {
    const out = resizeBaseplate(bricks, bp(16, 16), 'S', 'grow')
    expect(out).toEqual({ bricks, baseplate: bp(16, 24) })
  })

  it('W grows -X and shifts every brick +8 on X', () => {
    const out = resizeBaseplate(bricks, bp(16, 16), 'W', 'grow')
    expect(out).toEqual({ bricks: [b('a', 8, 0, 0), b('b', 12, 3, 2)], baseplate: bp(24, 16) })
  })

  it('N grows -Z and shifts every brick +8 on Z', () => {
    const out = resizeBaseplate(bricks, bp(16, 16), 'N', 'grow')
    expect(out).toEqual({ bricks: [b('a', 0, 0, 8), b('b', 4, 3, 10)], baseplate: bp(16, 24) })
  })

  it('grows each axis independently up to 48, then reports max', () => {
    expect(resizeBaseplate([], bp(40, 8), 'E', 'grow')).toEqual({ bricks: [], baseplate: bp(48, 8) })
    expect(resizeBaseplate([], bp(48, 8), 'E', 'grow')).toEqual({ error: 'max' })
    expect(resizeBaseplate([], bp(48, 8), 'W', 'grow')).toEqual({ error: 'max' })
    expect(resizeBaseplate([], bp(48, 8), 'N', 'grow')).toEqual({ bricks: [], baseplate: bp(48, 16) })
    expect(resizeBaseplate([], bp(8, 48), 'S', 'grow')).toEqual({ error: 'max' })
    expect(resizeBaseplate([], bp(8, 48), 'N', 'grow')).toEqual({ error: 'max' })
  })

  it('does not mutate its inputs', () => {
    const input = [b('a', 0, 0, 0)]
    const plate = bp(16, 16)
    const out = resizeBaseplate(input, plate, 'W', 'grow')
    expect(input).toEqual([b('a', 0, 0, 0)])
    expect(plate).toEqual(bp(16, 16))
    if ('error' in out) throw new Error('unexpected error')
    expect(out.bricks).not.toBe(input)
    expect(out.baseplate).not.toBe(plate)
  })
})

describe('resizeBaseplate shrink', () => {
  it('E / S shrink without moving bricks when the strip is empty', () => {
    const bricks = [b('a', 0, 0, 0)]
    expect(resizeBaseplate(bricks, bp(24, 16), 'E', 'shrink')).toEqual({ bricks, baseplate: bp(16, 16) })
    expect(resizeBaseplate(bricks, bp(16, 24), 'S', 'shrink')).toEqual({ bricks, baseplate: bp(16, 16) })
  })

  it('W shrinks and shifts every brick -8 on X', () => {
    const out = resizeBaseplate([b('a', 8, 0, 3)], bp(24, 16), 'W', 'shrink')
    expect(out).toEqual({ bricks: [b('a', 0, 0, 3)], baseplate: bp(16, 16) })
  })

  it('N shrinks and shifts every brick -8 on Z', () => {
    const out = resizeBaseplate([b('a', 3, 0, 8)], bp(16, 24), 'N', 'shrink')
    expect(out).toEqual({ bricks: [b('a', 3, 0, 0)], baseplate: bp(16, 16) })
  })

  it('reports min at 8 studs on that axis', () => {
    expect(resizeBaseplate([], bp(8, 16), 'E', 'shrink')).toEqual({ error: 'min' })
    expect(resizeBaseplate([], bp(8, 16), 'W', 'shrink')).toEqual({ error: 'min' })
    expect(resizeBaseplate([], bp(16, 8), 'N', 'shrink')).toEqual({ error: 'min' })
    expect(resizeBaseplate([], bp(16, 8), 'S', 'shrink')).toEqual({ error: 'min' })
    expect(resizeBaseplate([], bp(8, 16), 'S', 'shrink')).toEqual({ bricks: [], baseplate: bp(8, 8) })
  })

  it('reports not_empty when a brick cell lies in the strip', () => {
    // 2x4 at x=6 covers x 6..7: inside the W strip (x < 8), outside the E strip of a 24-wide plate.
    const bricks = [b('a', 6, 0, 10)]
    expect(resizeBaseplate(bricks, bp(24, 24), 'W', 'shrink')).toEqual({ error: 'not_empty' })
    expect(resizeBaseplate(bricks, bp(24, 24), 'E', 'shrink')).toEqual({ bricks, baseplate: bp(16, 24) })
  })

  it('a brick straddling the strip border blocks the shrink', () => {
    // 2x4 at x=15 on a 24-wide plate covers x 15..16; the E strip is x 16..23.
    expect(resizeBaseplate([b('a', 15, 0, 0)], bp(24, 16), 'E', 'shrink')).toEqual({ error: 'not_empty' })
    // One stud further in, the strip is free.
    expect(resizeBaseplate([b('a', 14, 0, 0)], bp(24, 16), 'E', 'shrink')).toEqual({
      bricks: [b('a', 14, 0, 0)],
      baseplate: bp(16, 16),
    })
  })

  it('uses the rotated footprint', () => {
    // brick_2x4 at r=0 covers z 4..7 (N strip is z < 8): blocked.
    expect(resizeBaseplate([b('a', 10, 0, 4)], bp(16, 24), 'N', 'shrink')).toEqual({ error: 'not_empty' })
    // r=1 swaps the footprint to 4 along X, 2 along Z: z 6..7 still in the strip.
    expect(resizeBaseplate([b('a', 10, 0, 6, 'brick_2x4', 1)], bp(16, 24), 'N', 'shrink')).toEqual({
      error: 'not_empty',
    })
    // At r=1 from (4, 8) it covers x 4..7, z 8..9: clear of the N strip and of the E strip (x >= 8).
    const rotated = [b('a', 4, 0, 8, 'brick_2x4', 1)]
    expect(resizeBaseplate(rotated, bp(16, 24), 'N', 'shrink')).toEqual({
      bricks: [b('a', 4, 0, 0, 'brick_2x4', 1)],
      baseplate: bp(16, 16),
    })
    expect(resizeBaseplate(rotated, bp(16, 24), 'E', 'shrink')).toEqual({ bricks: rotated, baseplate: bp(8, 24) })
    const reaching = [b('a', 5, 0, 8, 'brick_2x4', 1)] // x 5..8
    expect(resizeBaseplate(reaching, bp(16, 24), 'E', 'shrink')).toEqual({ error: 'not_empty' })
  })

  it('counts every height of tall and stacked bricks', () => {
    // A 1x4x6 door (18 plates tall) rotated so it runs along Z at x=20: in the E strip.
    const door = b('door', 20, 0, 0, 'door_1x4x6', 1)
    expect(resizeBaseplate([door], bp(24, 16), 'E', 'shrink')).toEqual({ error: 'not_empty' })
    // A brick high up (e.g. left floating after its support was deleted) still counts.
    const high = b('high', 0, 30, 0)
    expect(resizeBaseplate([high], bp(16, 16), 'W', 'shrink')).toEqual({ error: 'not_empty' })
  })

  it('checks min before emptiness', () => {
    expect(resizeBaseplate([b('a', 0, 0, 0)], bp(8, 8), 'W', 'shrink')).toEqual({ error: 'min' })
  })
})

describe('canShrink', () => {
  const sides: PlateSide[] = ['N', 'E', 'S', 'W']

  it('is true on every side of an empty plate above the minimum', () => {
    for (const s of sides) expect(canShrink([], bp(16, 16), s)).toBe(true)
  })

  it('is false at the minimum size', () => {
    for (const s of sides) expect(canShrink([], bp(8, 8), s)).toBe(false)
    expect(canShrink([], bp(8, 16), 'W')).toBe(false)
    expect(canShrink([], bp(8, 16), 'N')).toBe(true)
  })

  it('is false only on the sides whose strip holds a brick', () => {
    const bricks = [b('a', 0, 0, 0)] // corner x 0..1, z 0..3: W and N strips
    expect(canShrink(bricks, bp(16, 16), 'W')).toBe(false)
    expect(canShrink(bricks, bp(16, 16), 'N')).toBe(false)
    expect(canShrink(bricks, bp(16, 16), 'E')).toBe(true)
    expect(canShrink(bricks, bp(16, 16), 'S')).toBe(true)
  })

  it('agrees with resizeBaseplate', () => {
    const bricks = [b('a', 7, 0, 15, 'brick_2x4', 1), b('b', 12, 3, 2)]
    for (const s of sides) {
      for (const plate of [bp(8, 8), bp(16, 24), bp(24, 16), bp(48, 48)]) {
        const ok = !('error' in resizeBaseplate(bricks, plate, s, 'shrink'))
        expect(canShrink(bricks, plate, s)).toBe(ok)
      }
    }
  })
})

describe('baseplate colour', () => {
  it('offers gray, green, blue, tan and white', () => {
    expect(BASEPLATE_COLORS).toEqual([24, 5, 3, 10, 0])
    expect(BASEPLATE_COLORS.map((c) => COLORS[c].name.en)).toEqual(['Light bluish gray', 'Green', 'Blue', 'Tan', 'White'])
  })

  it('defaults to green', () => {
    expect(DEFAULT_PLATE_COLOR).toBe(5)
    expect(plateColor(bp(16, 16), 'building')).toBe(5)
  })

  it('without a stored colour, vehicle and prop plates keep their Phase 1 look', () => {
    expect(plateColor(bp(8, 16), 'vehicle')).toBe(8)
    expect(plateColor(bp(8, 8), 'prop')).toBe(10)
  })

  it('a stored colour wins for every kind', () => {
    expect(plateColor({ w: 8, d: 16, c: 24 }, 'vehicle')).toBe(24)
    expect(plateColor({ w: 16, d: 16, c: 0 }, 'building')).toBe(0)
  })

  it('ignores a stored index that is not a colour', () => {
    expect(plateColor({ w: 16, d: 16, c: 99 }, 'building')).toBe(5)
    expect(plateColor({ w: 16, d: 16, c: 1.5 }, 'vehicle')).toBe(8)
  })

  it('resizing keeps the colour', () => {
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const grown = resizeBaseplate([], { w: 16, d: 16, c: 24 }, side, 'grow')
      if ('error' in grown) throw new Error('unexpected error')
      expect(grown.baseplate.c).toBe(24)
      const shrunk = resizeBaseplate([], { w: 16, d: 16, c: 3 }, side, 'shrink')
      if ('error' in shrunk) throw new Error('unexpected error')
      expect(shrunk.baseplate.c).toBe(3)
    }
  })
})
