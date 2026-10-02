import { describe, expect, it } from 'vitest'
import { MAX_HEIGHT_PLATES, canPlace, pointerAnchor, settleAnchor } from './model'
import { getPart } from './parts/catalog'
import { targetAnchor, type PickHit, type Vec3 } from './pick'
import type { Baseplate, Brick, Rot } from './types'
import { platesToWorld } from './units'

const bp: Baseplate = { w: 16, d: 16 }
const UP: [number, number, number] = [0, 1, 0]
const b = (id: string, p: string, x: number, y: number, z: number, r: Rot = 0): Brick => ({ id, p, x, y, z, r, c: 0 })

/** What the Workshop does for a pointer hit (`pointerAnchor`), next to the raw `targetAnchor`. */
function drop(bricks: Brick[], hit: PickHit, partId: string, r: Rot = 0, excludeId?: string) {
  const part = getPart(partId)
  const raw = targetAnchor(hit, part, r)
  const settled = pointerAnchor(bricks, hit, part, r, bp, excludeId)
  const err = canPlace(bricks, { id: 'n', p: partId, r, c: 0, ...settled }, bp, excludeId)
  return { raw, settled, err }
}

/** A plate hit seen from `origin`: the ray from `origin` through world point `through`, carried on to y = 0. */
function plateHitThrough(origin: Vec3, through: Vec3): PickHit {
  const t = origin[1] / (origin[1] - through[1])
  const point: Vec3 = [origin[0] + (through[0] - origin[0]) * t, 0, origin[2] + (through[2] - origin[2]) * t]
  return { point, normal: UP, brick: null, origin }
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

describe('pointerAnchor', () => {
  // Left support 3 plates tall at x 4, right support 6 plates tall at x 7: 2 studs apart (x 5, 6).
  const supports = [b('l', 'brick_1x1', 4, 0, 4), b('r0', 'brick_1x1', 7, 0, 4), b('r1', 'brick_1x1', 7, 3, 4)]
  const ALONG_X: Rot = 1 // brick_1x6 is 1 wide and 6 deep: a quarter turn lays it along X
  // The Workshop camera: high up, in front of the plate (+Z), looking down at it.
  const camera: Vec3 = [8, 14, 22]

  it('a 1x6 aimed at the plate between two supports rests on the taller one and bridges the gap', () => {
    // A plate hit in the gap, cell (5, 4): the 1x6 spans x 3..8 and covers both supports.
    const { raw, settled, err } = drop(supports, { point: [5.5, 0, 4.5], normal: UP, brick: null }, 'brick_1x6', ALONG_X)
    expect(raw).toEqual({ x: 3, y: 0, z: 4 })
    expect(settled).toEqual({ x: 3, y: 6, z: 4 })
    expect(err).toBeNull()
  })

  it('the pointer over the gap at the height of the supports bridges them, though the ray hits the plate behind them', () => {
    // Aimed where the bridge goes: above the gap (cell 5, row 4) at the tall support's top.
    const hit = plateHitThrough(camera, [5.5, platesToWorld(6), 4.5])
    const { raw, settled, err } = drop(supports, hit, 'brick_1x6', ALONG_X)
    // The ray goes on past the supports: the plate hit alone puts the 1x6 on empty ground further back.
    expect(raw.y).toBe(0)
    expect(raw.z).toBeLessThan(4)
    expect(settleAnchor(supports, getPart('brick_1x6'), ALONG_X, raw, bp).y).toBe(0)
    expect(settled).toEqual({ x: 3, y: 6, z: 4 })
    expect(err).toBeNull()
  })

  it('a brick aimed at the empty plate stays on the plate', () => {
    const hit = plateHitThrough(camera, [11.5, 0, 12.5])
    const { raw, settled, err } = drop(supports, hit, 'brick_2x4')
    expect(settled).toEqual(raw)
    expect(settled.y).toBe(0)
    expect(err).toBeNull()
  })

  it('a brick aimed at the top of a single brick sits on it', () => {
    const base = [b('a', 'brick_2x4', 6, 0, 6)]
    const hit: PickHit = { point: [6.5, platesToWorld(3), 7.5], normal: UP, brick: base[0], origin: camera }
    const { raw, settled, err } = drop(base, hit, 'brick_2x2')
    expect(settled).toEqual({ x: 6, y: 3, z: 7 })
    expect(settled).toEqual(raw)
    expect(err).toBeNull()
  })

  it('a side hit picks the next cell at the hit brick level and only climbs on a collision', () => {
    // A 2x2 raised on another: its +X face at y 3..6 targets cell (6, 4) at y = 3, with nothing under it.
    const bricks = [b('a', 'brick_2x2', 4, 0, 4), b('c', 'brick_2x2', 4, 3, 4)]
    const hit: PickHit = { point: [6, platesToWorld(4), 4.5], normal: [1, 0, 0], brick: bricks[1], origin: camera }
    const floating = drop(bricks, hit, 'brick_1x1')
    expect(floating.raw).toEqual({ x: 6, y: 3, z: 4 })
    expect(floating.settled).toEqual(floating.raw) // as before: nothing to rest on there
    expect(floating.err).toBe('unsupported')
    // A neighbour in that cell: the drop climbs onto it.
    const withNeighbour = [...bricks, b('n', 'brick_1x1', 6, 0, 4), b('n2', 'brick_1x1', 6, 3, 4)]
    const stacked = drop(withNeighbour, hit, 'brick_1x1')
    expect(stacked.settled).toEqual({ x: 6, y: 6, z: 4 })
    expect(stacked.err).toBeNull()
  })

  it('a floor hit inside a roofed room, seen through its door, places on the floor', () => {
    // A room 6x6 outside (x and z 4..9, a 4x4 floor inside): 1x1 walls two bricks (6 plates) high with a
    // 2-wide door in the front wall (x 6..7, z 9), and a roof of 2x2 plates on top at y = 6.
    const room: Brick[] = []
    for (let x = 4; x <= 9; x++) {
      for (let z = 4; z <= 9; z++) {
        const wall = x === 4 || x === 9 || z === 4 || z === 9
        const door = z === 9 && (x === 6 || x === 7)
        if (wall && !door) for (const y of [0, 3]) room.push(b(`w${x},${y},${z}`, 'brick_1x1', x, y, z))
      }
    }
    for (let x = 4; x <= 8; x += 2) for (let z = 4; z <= 8; z += 2) room.push(b(`roof${x},${z}`, 'plate_2x2', x, 6, z))
    // A low camera in front looks in through the door: the ray from (6.5, 3, 20) to the floor point (6.5, 0, 7.5)
    // is at y 0.6 where it passes the front wall (z 10), under the door's top (y 2.4) and the roof.
    const eye: Vec3 = [6.5, 3, 20]
    const floor: PickHit = { point: [6.5, 0, 7.5], normal: UP, brick: null, origin: eye }
    const { settled, err } = drop(room, floor, 'brick_1x1')
    expect(settled).toEqual({ x: 6, y: 0, z: 7 })
    expect(err).toBeNull()
    // The same without a ray origin (the plain fallback) stays on the floor too: the roof does not pull it up.
    expect(drop(room, { ...floor, origin: undefined }, 'brick_1x1').settled).toEqual({ x: 6, y: 0, z: 7 })
  })

  it('a hit on the underside of an overhang still places under it when that fits', () => {
    // A 2x4 resting on a 1x1 at its corner: room for a brick under the rest of it.
    const bricks = [b('post', 'brick_1x1', 4, 0, 4), b('roof', 'brick_2x4', 4, 3, 4)]
    const low: Vec3 = [5.5, 0.6, 20]
    const under: PickHit = { point: [5.5, platesToWorld(3), 6.5], normal: [0, -1, 0], brick: bricks[1], origin: low }
    const brick = drop(bricks, under, 'brick_1x1')
    expect(brick.settled).toEqual({ x: 5, y: 0, z: 6 })
    expect(brick.err).toBeNull()
    // A plate would hang in the air under the roof (unsupported): it settles up to the next supported level, the roof top.
    const plate = drop(bricks, under, 'plate_1x1')
    expect(plate.raw.y).toBe(2)
    expect(plate.settled).toEqual({ x: 5, y: 6, z: 6 })
    expect(plate.err).toBeNull()
  })

  it('keeps off-plate and over-height drops invalid', () => {
    const off = drop([], plateHitThrough(camera, [15.5, 0, 8.5]), 'brick_2x4')
    expect(off.settled.x).toBe(15)
    expect(off.err).toBe('out_of_bounds')

    const tower: Brick[] = []
    for (let y = 0; y < MAX_HEIGHT_PLATES; y += 3) tower.push(b(`t${y}`, 'brick_2x2', 4, y, 4))
    const top: PickHit = { point: [4.5, platesToWorld(MAX_HEIGHT_PLATES), 4.5], normal: UP, brick: tower.at(-1)!, origin: [4.5, 80, 30] }
    const high = drop(tower, top, 'brick_1x1')
    expect(high.settled.y).toBe(MAX_HEIGHT_PLATES)
    expect(high.err).toBe('out_of_bounds')
  })

  it('a moved brick is not an obstacle to itself', () => {
    // Moving the tall support's top brick: it no longer counts, so the 1x6 rests on the 3-plate tops.
    const { settled, err } = drop(supports, { point: [5.5, 0, 4.5], normal: UP, brick: null, origin: camera }, 'brick_1x6', ALONG_X, 'r1')
    expect(settled.y).toBe(3)
    expect(err).toBeNull()
  })
})
