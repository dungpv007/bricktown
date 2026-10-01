import { describe, expect, it } from 'vitest'
import { duplicateSpot } from './duplicate'
import { MAX_BRICKS, MAX_HEIGHT_PLATES } from './model'
import type { Baseplate, Brick } from './types'

const bp: Baseplate = { w: 16, d: 16 }
// brick_2x4 at r=0: 2 studs along X, 4 along Z, 3 plates tall.
const b = (id: string, x: number, y: number, z: number, p = 'brick_2x4', r: 0 | 1 | 2 | 3 = 0): Brick => ({
  id, p, x, y, z, r, c: 0,
})

describe('duplicateSpot', () => {
  it('puts the copy directly on top first', () => {
    const src = b('a', 4, 0, 4)
    expect(duplicateSpot([src], src, bp)).toEqual({ spot: { x: 4, y: 3, z: 4 } })
  })

  it('then tries +X, -X, +Z, -Z neighbours at the same height (by the rotated footprint)', () => {
    const src = b('a', 4, 0, 4)
    const lid = b('lid', 4, 3, 4) // blocks "on top"
    expect(duplicateSpot([src, lid], src, bp)).toEqual({ spot: { x: 6, y: 0, z: 4 } })
    const px = b('px', 6, 0, 4)
    expect(duplicateSpot([src, lid, px], src, bp)).toEqual({ spot: { x: 2, y: 0, z: 4 } })
    const nx = b('nx', 2, 0, 4)
    expect(duplicateSpot([src, lid, px, nx], src, bp)).toEqual({ spot: { x: 4, y: 0, z: 8 } })
    const pz = b('pz', 4, 0, 8)
    expect(duplicateSpot([src, lid, px, nx, pz], src, bp)).toEqual({ spot: { x: 4, y: 0, z: 0 } })
    // A rotated brick steps by its rotated footprint (4 along X).
    const turned = b('t', 4, 0, 10, 'brick_2x4', 1)
    const tlid = b('tl', 4, 3, 10, 'brick_2x4', 1)
    expect(duplicateSpot([turned, tlid], turned, bp)).toEqual({ spot: { x: 8, y: 0, z: 10 } })
  })

  it('then on top of those neighbours', () => {
    const src = b('a', 4, 0, 4)
    const around = [b('lid', 4, 3, 4), b('px', 6, 0, 4), b('nx', 2, 0, 4), b('pz', 4, 0, 8), b('nz', 4, 0, 0)]
    expect(duplicateSpot([src, ...around], src, bp)).toEqual({ spot: { x: 6, y: 3, z: 4 } })
  })

  it('skips spots off the plate', () => {
    const src = b('a', 14, 0, 0) // +X and -Z are off the plate
    const lid = b('lid', 14, 3, 0)
    expect(duplicateSpot([src, lid], src, bp)).toEqual({ spot: { x: 12, y: 0, z: 0 } })
  })

  it('reports why when no spot fits', () => {
    const tiny: Baseplate = { w: 2, d: 4 }
    const src = b('a', 0, 0, 0)
    // A tower up to the height limit sits on it, and every neighbour is off the plate.
    const tower = Array.from({ length: Math.floor(MAX_HEIGHT_PLATES / 3) - 1 }, (_, i) => b(`s${i}`, 0, 3 * (i + 1), 0))
    expect(duplicateSpot([src, ...tower], src, tiny)).toEqual({ error: 'collision' })
    const many = Array.from({ length: MAX_BRICKS }, (_, i) => b(`m${i}`, (i % 8) * 2, 0, 0))
    expect(duplicateSpot(many, src, bp)).toEqual({ error: 'limit' })
  })
})
