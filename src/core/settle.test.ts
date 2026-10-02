import { describe, expect, it } from 'vitest'
import { MAX_HEIGHT_PLATES, canPlace, settleAnchor } from './model'
import { getPart } from './parts/catalog'
import { targetAnchor, type PickHit } from './pick'
import type { Baseplate, Brick, Rot } from './types'

const bp: Baseplate = { w: 16, d: 16 }
const UP: [number, number, number] = [0, 1, 0]
const b = (id: string, p: string, x: number, y: number, z: number, r: Rot = 0): Brick => ({ id, p, x, y, z, r, c: 0 })

/** What the Workshop does for a pointer hit: the raw anchor, then settling it. */
function drop(bricks: Brick[], hit: PickHit, partId: string, r: Rot = 0, excludeId?: string) {
  const part = getPart(partId)
  const raw = targetAnchor(hit, part, r)
  const settled = settleAnchor(bricks, part, r, raw, bp, excludeId)
  const err = canPlace(bricks, { id: 'n', p: partId, r, c: 0, ...settled }, bp, excludeId)
  return { raw, settled, err }
}

describe('settleAnchor', () => {
  it('leaves a valid anchor alone', () => {
    const bricks = [b('a', 'brick_2x2', 4, 0, 4)]
    const part = getPart('brick_2x2')
    expect(settleAnchor(bricks, part, 0, { x: 8, y: 0, z: 8 }, bp)).toEqual({ x: 8, y: 0, z: 8 })
    expect(settleAnchor(bricks, part, 0, { x: 4, y: 3, z: 4 }, bp)).toEqual({ x: 4, y: 3, z: 4 })
  })

  it('a plate hit whose footprint half covers a brick stacks on top of it', () => {
    const bricks = [b('a', 'brick_2x2', 4, 0, 4)]
    // 2x4 centred on cell (3, 4) spans x 3..4, z 3..6: overlaps the 2x2 at x 4.
    const { raw, settled, err } = drop(bricks, { point: [3.5, 0, 4.5], normal: UP, brick: null }, 'brick_2x4')
    expect(raw.y).toBe(0)
    expect(err).toBeNull()
    expect(settled).toEqual({ x: raw.x, y: 3, z: raw.z })
  })

  it('a top hit on a short brick next to a taller one climbs over the taller one', () => {
    const bricks = [b('lo', 'plate_2x2', 0, 0, 0), b('hi', 'brick_2x2', 2, 0, 0)]
    // Top of the plate (y = 1): a 2x2 centred on its cell (1, 0) spans x 1..2 and hits the brick.
    const hit: PickHit = { point: [1.5, 0.4, 0.5], normal: UP, brick: bricks[0] }
    const { raw, settled, err } = drop(bricks, hit, 'brick_2x2')
    expect(raw.y).toBe(1)
    expect(err).toBeNull()
    expect(settled.y).toBe(3)
    expect([settled.x, settled.z]).toEqual([raw.x, raw.z])
  })

  it('a side hit into an occupied cell climbs onto what is there', () => {
    // 2x2 at (4, 0, 4) with another 2x2 at (6, 0, 4) next to it. A side hit on the first
    // brick's +X face targets the neighbour's cell at y = 0.
    const bricks = [b('a', 'brick_2x2', 4, 0, 4), b('c', 'brick_2x2', 6, 0, 4)]
    const hit: PickHit = { point: [6, 0.5, 4.5], normal: [1, 0, 0], brick: bricks[0] }
    const { raw, settled, err } = drop(bricks, hit, 'brick_1x1')
    expect(raw).toEqual({ x: 6, y: 0, z: 4 })
    expect(err).toBeNull()
    expect(settled).toEqual({ x: 6, y: 3, z: 4 })
  })

  it('skips over a stack of bricks to the first free level and ignores the moving brick', () => {
    const bricks = [b('a', 'brick_2x2', 4, 0, 4), b('b', 'brick_2x2', 4, 3, 4), b('m', 'brick_2x2', 4, 6, 4)]
    const part = getPart('brick_2x2')
    expect(settleAnchor(bricks, part, 0, { x: 4, y: 0, z: 4 }, bp)).toEqual({ x: 4, y: 9, z: 4 })
    expect(settleAnchor(bricks, part, 0, { x: 4, y: 0, z: 4 }, bp, 'm')).toEqual({ x: 4, y: 6, z: 4 })
    // Moving the top brick onto its own spot stays put.
    expect(settleAnchor(bricks, part, 0, { x: 4, y: 6, z: 4 }, bp, 'm')).toEqual({ x: 4, y: 6, z: 4 })
  })

  it('never changes x/z and keeps off-plate positions invalid', () => {
    const bricks = [b('a', 'brick_2x2', 4, 0, 4)]
    const part = getPart('brick_2x2')
    const off = { x: 15, y: 0, z: 4 }
    expect(settleAnchor(bricks, part, 0, off, bp)).toEqual(off)
    expect(canPlace(bricks, { id: 'n', p: 'brick_2x2', r: 0, c: 0, ...off }, bp)).toBe('out_of_bounds')
    expect(settleAnchor(bricks, part, 0, { x: -1, y: 0, z: 4 }, bp)).toEqual({ x: -1, y: 0, z: 4 })
  })

  it('returns the original anchor when the stack reaches the height limit', () => {
    const tower: Brick[] = []
    for (let y = 0; y < MAX_HEIGHT_PLATES; y += 3) tower.push(b(`t${y}`, 'brick_2x2', 4, y, 4))
    const part = getPart('brick_2x2')
    const a = { x: 4, y: 0, z: 4 }
    expect(settleAnchor(tower, part, 0, a, bp)).toEqual(a)
    // One brick short of the limit: the last free level is the top.
    expect(settleAnchor(tower.slice(0, -1), part, 0, a, bp)).toEqual({ x: 4, y: MAX_HEIGHT_PLATES - 3, z: 4 })
  })

  it('climbs from a negative anchor (a hit under a brick near the ground) and never goes below 0', () => {
    const bricks = [b('a', 'brick_2x2', 4, 0, 4)]
    const part = getPart('plate_2x2')
    expect(settleAnchor(bricks, part, 0, { x: 10, y: -2, z: 10 }, bp)).toEqual({ x: 10, y: 0, z: 10 })
    expect(settleAnchor(bricks, part, 0, { x: 4, y: -2, z: 4 }, bp)).toEqual({ x: 4, y: 3, z: 4 })
  })

  it('an overhang with nothing under it stays unsupported (original anchor, usual error)', () => {
    const bricks = [b('a', 'brick_2x2', 4, 0, 4)]
    const part = getPart('brick_1x1')
    const a = { x: 9, y: 3, z: 9 }
    expect(settleAnchor(bricks, part, 0, a, bp)).toEqual(a)
  })

  it('agrees with a brute-force climb through canPlace on random models', () => {
    let seed = 12345
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    const parts = ['brick_1x1', 'brick_2x2', 'brick_2x4', 'plate_2x2', 'plate_1x1', 'plate_4x4']
    const small: Baseplate = { w: 8, d: 8 }
    for (let round = 0; round < 60; round++) {
      let bricks: Brick[] = []
      for (let i = 0; i < 25; i++) {
        const p = parts[rnd(parts.length)]
        const cand = b(`b${i}`, p, rnd(8), rnd(12), rnd(8), rnd(4) as Rot)
        if (canPlace(bricks, cand, small) === null) bricks = [...bricks, cand]
      }
      const excludeId = round % 2 ? bricks[rnd(bricks.length)]?.id : undefined
      for (let k = 0; k < 20; k++) {
        const p = parts[rnd(parts.length)]
        const r = rnd(4) as Rot
        const anchor = { x: rnd(9) - 1, y: rnd(14) - 2, z: rnd(9) - 1 }
        let expected = anchor
        for (let y = Math.max(0, anchor.y); y + getPart(p).h <= MAX_HEIGHT_PLATES; y++) {
          const probe = { id: 'n', p, r, c: 0, x: anchor.x, y, z: anchor.z }
          if (canPlace(bricks, probe, small, excludeId) === null) {
            expected = { ...anchor, y }
            break
          }
        }
        expect(settleAnchor(bricks, getPart(p), r, anchor, small, excludeId)).toEqual(expected)
      }
    }
  })

  it('handles a rotated footprint over a brick and a plate on top of it', () => {
    const bricks = [b('a', 'brick_2x2', 4, 0, 4), b('s', 'plate_1x1', 7, 3, 4)]
    const part = getPart('brick_2x4')
    // r=1: fx 4, fz 2 at x 4..7, z 4..5: covers the 2x2 and the plate above it, so the top is y 4.
    expect(settleAnchor(bricks, part, 1, { x: 4, y: 0, z: 4 }, bp)).toEqual({ x: 4, y: 4, z: 4 })
  })
})
