import { describe, expect, it } from 'vitest'
import { getPart } from './parts/catalog'
import { rotateNormalY, targetAnchor, type PickHit } from './pick'
import type { Brick, Rot } from './types'

const UP: [number, number, number] = [0, 1, 0]
const brickAt = (p: string, x: number, y: number, z: number, r: Rot = 0): Brick => ({
  id: 'b', p, x, y, z, r, c: 0,
})
const anchor = (hit: PickHit, partId: string, r: Rot = 0) => targetAnchor(hit, getPart(partId), r)

describe('targetAnchor on the baseplate', () => {
  it('uses the floored hit cell at ground level for a 1x1 part', () => {
    expect(anchor({ point: [3.4, 0, 5.7], normal: UP, brick: null }, 'brick_1x1')).toEqual({ x: 3, y: 0, z: 5 })
  })

  it('also floors hits on baseplate studs (side normals are ignored)', () => {
    expect(anchor({ point: [3.2, 0.1, 5.5], normal: [-1, 0, 0], brick: null }, 'brick_1x1')).toEqual({
      x: 3, y: 0, z: 5,
    })
  })

  it('centres a 2x4 footprint on the hit cell', () => {
    // fx=2, fz=4 -> x = 3 - floor(1/2) = 3, z = 5 - floor(3/2) = 4
    expect(anchor({ point: [3.4, 0, 5.7], normal: UP, brick: null }, 'brick_2x4')).toEqual({ x: 3, y: 0, z: 4 })
  })

  it('centres the rotated footprint (r=1 swaps to fx=4, fz=2)', () => {
    expect(anchor({ point: [3.4, 0, 5.7], normal: UP, brick: null }, 'brick_2x4', 1)).toEqual({ x: 2, y: 0, z: 5 })
  })

  it('treats r=2 like r=0 and r=3 like r=1 for the footprint', () => {
    const hit: PickHit = { point: [6.1, 0, 6.9], normal: UP, brick: null }
    expect(anchor(hit, 'plate_4x8', 2)).toEqual(anchor(hit, 'plate_4x8', 0))
    expect(anchor(hit, 'plate_4x8', 3)).toEqual(anchor(hit, 'plate_4x8', 1))
    // fx=8, fz=4 at r=1 -> x = 6 - 3 = 3, z = 6 - 1 = 5
    expect(anchor(hit, 'plate_4x8', 1)).toEqual({ x: 3, y: 0, z: 5 })
  })
})

describe('targetAnchor on a brick', () => {
  const b = brickAt('brick_2x2', 2, 0, 2)

  it('top face stacks on top of the brick (brick height = 3 plates)', () => {
    expect(anchor({ point: [2.6, 1.2, 3.3], normal: UP, brick: b }, 'plate_1x1')).toEqual({ x: 2, y: 3, z: 3 })
  })

  it('top face of a plate stacks one plate higher', () => {
    const plate = brickAt('plate_2x2', 0, 3, 0)
    expect(anchor({ point: [1.5, 1.6, 0.5], normal: UP, brick: plate }, 'brick_1x1')).toEqual({ x: 1, y: 4, z: 0 })
  })

  it('top face centres a rotated footprint on the hit cell', () => {
    // brick_1x4 r=1 -> fx=4, fz=1 -> x = 3 - floor(3/2) = 2
    expect(anchor({ point: [3.5, 1.2, 2.5], normal: UP, brick: b }, 'brick_1x4', 1)).toEqual({ x: 2, y: 3, z: 2 })
  })

  it('a hit on a stud side above the top face counts as the top face', () => {
    expect(anchor({ point: [2.8, 1.25, 2.5], normal: [1, 0, 0], brick: b }, 'brick_1x1')).toEqual({
      x: 2, y: 3, z: 2,
    })
  })

  it('a slope face (normal.y > 0.5) counts as the top face', () => {
    const slope = brickAt('slope_2x2', 0, 0, 0)
    expect(anchor({ point: [0.5, 0.9, 1.4], normal: [0, 0.64, 0.77], brick: slope }, 'brick_1x1')).toEqual({
      x: 0, y: 3, z: 1,
    })
  })

  it('side face +X places next to the brick at the same level', () => {
    expect(anchor({ point: [3.99, 0.5, 2.5], normal: [1, 0, 0], brick: b }, 'brick_1x1')).toEqual({ x: 4, y: 0, z: 2 })
  })

  it('side face -Z places in front of the brick', () => {
    expect(anchor({ point: [2.5, 0.5, 2.01], normal: [0, 0, -1], brick: b }, 'brick_1x1')).toEqual({ x: 2, y: 0, z: 1 })
  })

  it('side face -X keeps the brick level of a raised brick and centres the new footprint', () => {
    const raised = brickAt('brick_2x2', 4, 3, 4)
    // cell = (floor(4.01 - 0.5), floor(5.5)) = (3, 5); brick_2x4 r=0 -> z = 5 - 1 = 4
    expect(anchor({ point: [4.01, 1.8, 5.5], normal: [-1, 0, 0], brick: raised }, 'brick_2x4')).toEqual({
      x: 3, y: 3, z: 4,
    })
  })

  it('bottom face hangs the new part under the brick', () => {
    const high = brickAt('brick_2x2', 2, 6, 2)
    expect(anchor({ point: [2.5, 2.4, 2.5], normal: [0, -1, 0], brick: high }, 'plate_1x1')).toEqual({
      x: 2, y: 5, z: 2,
    })
    expect(anchor({ point: [2.5, 2.4, 2.5], normal: [0, -1, 0], brick: high }, 'brick_1x1')).toEqual({
      x: 2, y: 3, z: 2,
    })
  })

  it('bottom face may yield a negative y (caller rejects it)', () => {
    const low = brickAt('brick_2x2', 2, 1, 2)
    expect(anchor({ point: [2.5, 0.4, 2.5], normal: [0, -1, 0], brick: low }, 'brick_1x1').y).toBe(-2)
  })
})

describe('rotateNormalY', () => {
  it('is the identity for r=0', () => {
    expect(rotateNormalY([0.6, 0, 0.8], 0)).toEqual([0.6, 0, 0.8])
  })

  it('turns counter-clockwise viewed from above, like mesh rotation.y = r * PI/2', () => {
    expect(rotateNormalY([1, 0, 0], 1)).toEqual([0, 0, -1])
    expect(rotateNormalY([0, 0, 1], 1)).toEqual([1, 0, 0])
    expect(rotateNormalY([1, 0, 0], 2)).toEqual([-1, 0, 0])
    expect(rotateNormalY([1, 0, 0], 3)).toEqual([0, 0, 1])
  })

  it('leaves the vertical component alone', () => {
    expect(rotateNormalY([0, 1, 0], 3)).toEqual([0, 1, 0])
  })
})
