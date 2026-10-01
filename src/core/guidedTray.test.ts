import { describe, expect, it } from 'vitest'
import { figPreset } from './figures'
import { SNAP_PX, brickCorners, dropAnchor, snapTargetOnScreen, trayCards, type ScreenProjection } from './guidedTray'
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

describe('brickCorners', () => {
  it('lists the 8 corners of the box the brick fills (rotated footprint, plates to world)', () => {
    const corners = brickCorners(brick('b', 'brick_2x4', 2, 3, 1, 1)) // r = 1: 4 along X, 2 along Z
    expect(corners).toHaveLength(8)
    const span = (i: number) => [Math.min(...corners.map((c) => c[i])), Math.max(...corners.map((c) => c[i]))]
    expect(span(0)).toEqual([2, 6])
    expect(span(1)[0]).toBeCloseTo(1.2)
    expect(span(1)[1]).toBeCloseTo(2.4)
    expect(span(2)).toEqual([1, 3])
  })
})

describe('snapTargetOnScreen', () => {
  // Seen from straight above, 10 px per stud; `lifted` also draws higher points further up the screen.
  const top: ScreenProjection = ([x, , z]) => ({ x: x * 10, y: z * 10 })
  const lifted: ScreenProjection = ([x, y, z]) => ({ x: x * 10, y: z * 10 - y * 10 })
  const near = brick('near', 'brick_2x2', 0, 0, 0) // screen box 0..20 x 0..20
  const far = brick('far', 'brick_2x2', 10, 0, 0) // screen box 100..120 x 0..20

  it('picks the target whose screen box is nearest to the finger, within the reach', () => {
    expect(snapTargetOnScreen([far, near], { x: 50, y: 10 }, top, 40)?.id).toBe('near')
    expect(snapTargetOnScreen([near, far], { x: 75, y: 10 }, top, 40)?.id).toBe('far')
  })

  it('snaps with the finger right on the target', () => {
    expect(snapTargetOnScreen([near], { x: 10, y: 10 }, top, 40)?.id).toBe('near')
  })

  it('returns null when every target is beyond the reach; the reach itself still snaps', () => {
    expect(snapTargetOnScreen([near, far], { x: 60, y: 10 }, top, 39)).toBeNull()
    expect(snapTargetOnScreen([near], { x: 60, y: 10 }, top, 40)?.id).toBe('near')
  })

  it('prefers the target whose centre is nearer when the finger is inside several boxes', () => {
    const big = brick('big', 'plate_4x4', 0, 0, 0) // screen box 0..40
    const small = brick('small', 'brick_1x1', 3, 0, 3) // screen box 30..40
    expect(snapTargetOnScreen([big, small], { x: 34, y: 34 }, top, 40)?.id).toBe('small')
  })

  it('breaks exact ties by order (step order)', () => {
    const left = brick('left', 'brick_2x2', 0, 0, 0)
    const right = brick('right', 'brick_2x2', 4, 0, 0)
    expect(snapTargetOnScreen([left, right], { x: 30, y: 10 }, top, 40)?.id).toBe('left')
    expect(snapTargetOnScreen([right, left], { x: 30, y: 10 }, top, 40)?.id).toBe('right')
  })

  it('reaches a target high up a tall build when the finger is beside it on screen', () => {
    const high = brick('high', 'brick_1x1', 0, 30, 0) // 12 studs up: drawn around y -120..-132
    expect(snapTargetOnScreen([high], { x: 20, y: -125 }, lifted, SNAP_PX)?.id).toBe('high')
    expect(snapTargetOnScreen([high], { x: 5, y: 5 }, lifted, SNAP_PX)).toBeNull() // under it, on the plate
  })

  it('returns null without targets', () => {
    expect(snapTargetOnScreen([], { x: 0, y: 0 }, top, SNAP_PX)).toBeNull()
  })

  it('reaches about a fingertip', () => {
    expect(SNAP_PX).toBeGreaterThanOrEqual(40)
    expect(SNAP_PX).toBeLessThanOrEqual(90)
  })
})
