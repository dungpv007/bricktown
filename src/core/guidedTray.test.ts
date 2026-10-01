import { describe, expect, it } from 'vitest'
import { figPreset } from './figures'
import { SNAP_RADIUS, distanceToBrick, dropAnchor, snapTarget, trayCards } from './guidedTray'
import { getPart } from './parts/catalog'
import { targetAnchor, type PickHit } from './pick'
import type { Brick } from './types'

describe('dropAnchor (normal mode)', () => {
  const plateHit: PickHit = { point: [3.5, 0, 4.5], normal: [0, 1, 0], brick: null }
  const part = getPart('plate_2x4')

  it('uses the spot under the finger for the part at the card turn (like the workshop)', () => {
    expect(dropAnchor(plateHit, null, part, 0)).toEqual(targetAnchor(plateHit, part, 0))
    expect(dropAnchor(plateHit, null, part, 1)).toEqual(targetAnchor(plateHit, part, 1))
    expect(dropAnchor(plateHit, null, part, 1)).not.toEqual(dropAnchor(plateHit, null, part, 0))
  })

  it("over a target ghost means that ghost's spot, whatever the card turn", () => {
    const ghost: Brick = { id: 'g', p: 'plate_2x4', x: 1, y: 3, z: 3, r: 1, c: 10 }
    expect(dropAnchor(plateHit, ghost, part, 0)).toEqual({ x: 1, y: 3, z: 3 })
    expect(dropAnchor(plateHit, ghost, part, 1)).toEqual({ x: 1, y: 3, z: 3 })
  })
})

const brick = (id: string, p: string, x: number, y: number, z: number, r: Brick['r'] = 0, c = 1): Brick => ({ id, p, x, y, z, r, c })

describe('trayCards', () => {
  it('groups bricks by part and colour, in order of first appearance, with their bricks', () => {
    const a = brick('a', 'brick_2x2', 0, 0, 0, 0, 1)
    const b = brick('b', 'plate_2x4', 2, 0, 0, 1, 1)
    const c = brick('c', 'brick_2x2', 4, 0, 0, 0, 1)
    const d = brick('d', 'brick_2x2', 6, 0, 0, 0, 2)
    const cards = trayCards([a, b, c, d])
    expect(cards.map((k) => [k.key, k.p, k.c, k.bricks.map((x) => x.id)])).toEqual([
      ['brick_2x2-1', 'brick_2x2', 1, ['a', 'c']],
      ['plate_2x4-1', 'plate_2x4', 1, ['b']],
      ['brick_2x2-2', 'brick_2x2', 2, ['d']],
    ])
  })

  it('keeps figures of different looks on different cards, each with its style', () => {
    const police = figPreset('police')
    const chef = figPreset('chef')
    const f1: Brick = { ...brick('f1', 'minifig', 0, 0, 0, 0, police.torso), fig: police }
    const f2: Brick = { ...brick('f2', 'minifig', 2, 0, 0, 0, police.torso), fig: { ...chef, torso: police.torso } }
    const f3: Brick = { ...brick('f3', 'minifig', 4, 0, 0, 0, police.torso), fig: police }
    const cards = trayCards([f1, f2, f3])
    expect(cards.map((k) => k.bricks.map((x) => x.id))).toEqual([['f1', 'f3'], ['f2']])
    expect(cards[0].fig).toEqual(police)
    expect(new Set(cards.map((k) => k.key)).size).toBe(2)
  })

  it('is empty for no bricks', () => {
    expect(trayCards([])).toEqual([])
  })
})

describe('distanceToBrick', () => {
  // A 2x4 at (2, 0, 3), r = 0: x 2..4, z 3..7, 3 plates (1.2 world) tall.
  const b = brick('b', 'brick_2x4', 2, 0, 3)

  it('is 0 on or inside the brick', () => {
    expect(distanceToBrick([3, 0.6, 5], b)).toBe(0)
    expect(distanceToBrick([2, 1.2, 3], b)).toBe(0)
  })

  it('measures to the nearest point of the brick box', () => {
    expect(distanceToBrick([0, 0, 5], b)).toBeCloseTo(2)
    expect(distanceToBrick([3, 3.2, 5], b)).toBeCloseTo(2)
    expect(distanceToBrick([5, 0, 8], b)).toBeCloseTo(Math.SQRT2)
  })

  it('uses the rotated footprint', () => {
    // r = 1: 4 along X, 2 along Z.
    const turned = brick('t', 'brick_2x4', 2, 0, 3, 1)
    expect(distanceToBrick([5.5, 0, 4], turned)).toBe(0)
    expect(distanceToBrick([3, 0, 6], turned)).toBeCloseTo(1)
  })

  it('starts at the brick bottom plate', () => {
    const high = brick('h', 'brick_1x1', 0, 6, 0) // bottom at 2.4 world
    expect(distanceToBrick([0.5, 0, 0.5], high)).toBeCloseTo(2.4)
  })
})

describe('snapTarget', () => {
  const near = brick('near', 'brick_2x2', 0, 0, 0)
  const far = brick('far', 'brick_2x2', 10, 0, 0)

  it('picks the target nearest to the point within the radius', () => {
    expect(snapTarget([far, near], [2.5, 0, 1], SNAP_RADIUS)?.id).toBe('near')
    expect(snapTarget([near, far], [9, 0, 1], SNAP_RADIUS)?.id).toBe('far')
  })

  it('snaps when the finger is right on the target', () => {
    expect(snapTarget([near], [1, 1.2, 1], SNAP_RADIUS)?.id).toBe('near')
  })

  it('returns null when every target is farther than the radius', () => {
    expect(snapTarget([near, far], [6, 0, 1], SNAP_RADIUS)).toBeNull()
    expect(snapTarget([near], [2 + SNAP_RADIUS + 0.01, 0, 1], SNAP_RADIUS)).toBeNull()
  })

  it('accepts a point exactly at the radius', () => {
    expect(snapTarget([near], [2 + SNAP_RADIUS, 0, 1], SNAP_RADIUS)?.id).toBe('near')
  })

  it('breaks ties by order (step order)', () => {
    const left = brick('left', 'brick_2x2', 0, 0, 0)
    const right = brick('right', 'brick_2x2', 4, 0, 0)
    expect(snapTarget([left, right], [3, 0, 1], SNAP_RADIUS)?.id).toBe('left')
    expect(snapTarget([right, left], [3, 0, 1], SNAP_RADIUS)?.id).toBe('right')
  })

  it('returns null without targets', () => {
    expect(snapTarget([], [0, 0, 0], SNAP_RADIUS)).toBeNull()
  })

  it('snaps to about 3 studs', () => {
    expect(SNAP_RADIUS).toBeGreaterThanOrEqual(2)
    expect(SNAP_RADIUS).toBeLessThanOrEqual(4)
  })
})
