import { describe, expect, it } from 'vitest'
import { MAX_HEIGHT_PLATES, canPlace, stepAnchor } from './model'
import type { Baseplate, Brick, Rot } from './types'

const bp: Baseplate = { w: 16, d: 16 }
const b = (id: string, p: string, x: number, y: number, z: number, r: Rot = 0): Brick => ({ id, p, x, y, z, r, c: 0 })

/** The brick after a step, and whether the model accepts it there. */
function step(bricks: Brick[], id: string, dx: number, dz: number) {
  const brick = bricks.find((x) => x.id === id)!
  const to = stepAnchor(bricks, brick, dx, dz, bp)
  return { to, err: canPlace(bricks, { ...brick, ...to }, bp, id) }
}

describe('stepAnchor', () => {
  it('slides along the plate, keeping its height', () => {
    const bricks = [b('m', 'brick_2x2', 4, 0, 4)]
    expect(step(bricks, 'm', 1, 0)).toEqual({ to: { x: 5, y: 0, z: 4 }, err: null })
    expect(step(bricks, 'm', 0, -1)).toEqual({ to: { x: 4, y: 0, z: 3 }, err: null })
  })

  it('climbs onto a brick in its way', () => {
    const bricks = [b('m', 'brick_2x2', 4, 0, 4), b('wall', 'brick_2x2', 6, 0, 4)]
    // One stud right overlaps the wall at x 6: it lands on top of it.
    expect(step(bricks, 'm', 1, 0)).toEqual({ to: { x: 5, y: 3, z: 4 }, err: null })
  })

  it('climbs over a stack to the first free level', () => {
    const bricks = [b('m', 'brick_2x2', 4, 0, 4), b('a', 'brick_2x2', 6, 0, 4), b('c', 'brick_2x2', 6, 3, 4)]
    expect(step(bricks, 'm', 1, 0).to).toEqual({ x: 5, y: 6, z: 4 })
  })

  it('steps down from a brick onto the plate, and onto a lower brick', () => {
    const on = [b('base', 'brick_2x2', 4, 0, 4), b('m', 'brick_2x2', 4, 3, 4)]
    expect(step(on, 'm', 2, 0)).toEqual({ to: { x: 6, y: 0, z: 4 }, err: null })
    // The base it stood on does not count once it is stepping past it; a short plate to the side catches it.
    const stairs = [b('base', 'brick_2x2', 4, 0, 4), b('m', 'brick_2x2', 4, 3, 4), b('low', 'plate_2x2', 6, 0, 4)]
    expect(step(stairs, 'm', 2, 0)).toEqual({ to: { x: 6, y: 1, z: 4 }, err: null })
  })

  it('does not count itself as an obstacle', () => {
    // A 2x4 shifted one stud along its own length still overlaps its old cells.
    const bricks = [b('m', 'brick_2x4', 4, 0, 4)]
    expect(step(bricks, 'm', 0, 1)).toEqual({ to: { x: 4, y: 0, z: 5 }, err: null })
  })

  it('a roof overhead does not pull it up, and a floor under a roof is reachable', () => {
    const bricks = [b('m', 'brick_2x2', 3, 0, 4), b('roof', 'plate_4x4', 5, 6, 4)]
    // Stepping under the roof (it starts at plate 6, the brick is 3 tall): stays on the plate.
    expect(step(bricks, 'm', 1, 0)).toEqual({ to: { x: 4, y: 0, z: 4 }, err: null })
  })

  it('stays blocked at the plate edge (the stepped spot is off the plate, so canPlace rejects it)', () => {
    const left = [b('m', 'brick_2x2', 0, 0, 4)]
    expect(step(left, 'm', -1, 0)).toMatchObject({ to: { x: -1, y: 0, z: 4 }, err: 'out_of_bounds' })
    const right = [b('m', 'brick_2x2', 14, 0, 4)]
    expect(step(right, 'm', 1, 0).err).toBe('out_of_bounds')
    const far = [b('m', 'brick_2x4', 4, 0, 12)]
    expect(step(far, 'm', 0, 1).err).toBe('out_of_bounds')
    // A turned brick uses its turned footprint.
    const turned = [b('m', 'brick_2x4', 12, 0, 4, 1)]
    expect(step(turned, 'm', 1, 0).err).toBe('out_of_bounds')
  })

  it('stays blocked when the climb would pass the height limit', () => {
    const bricks: Brick[] = [b('m', 'brick_2x2', 4, 0, 4)]
    for (let y = 0; y < MAX_HEIGHT_PLATES; y += 3) bricks.push(b(`s${y}`, 'brick_2x2', 6, y, 4))
    expect(step(bricks, 'm', 1, 0).err).toBe('collision')
  })

  it('works for a brick resting on others, moving to an empty spot over the plate', () => {
    // m sits on a 2x2 and steps off its far side onto bare plate: it drops all the way down.
    const bricks = [b('base', 'brick_2x2', 4, 0, 4), b('m', 'brick_2x2', 4, 3, 4)]
    expect(step(bricks, 'm', 0, 2).to).toEqual({ x: 4, y: 0, z: 6 })
  })
})
