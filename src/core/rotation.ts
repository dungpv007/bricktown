import { getPart } from './parts/catalog'
import type { Brick, PartDef, Rot } from './types'
import { platesToWorld } from './units'

/**
 * cos/sin of r quarter turns, exact (no float noise from Math.cos(Math.PI / 2)). Index with a `Rot`.
 * Part-space (x, z) turns to world as `x' = x * cos + z * sin`, `z' = -x * sin + z * cos`.
 */
export const QUARTER_COS: readonly number[] = [1, 0, -1, 0]
export const QUARTER_SIN: readonly number[] = [0, 1, 0, -1]

/** Rotated footprint in studs: odd rotations swap width and depth. */
export function footprint(part: PartDef, r: Rot): { fx: number; fz: number } {
  return r % 2 === 0 ? { fx: part.w, fz: part.d } : { fx: part.d, fz: part.w }
}

/** Every occupied voxel [x, y, z] (footprint x height in plates), starting at the brick's min corner. */
export function cellsOf(brick: Brick): Array<[number, number, number]> {
  const part = getPart(brick.p)
  const { fx, fz } = footprint(part, brick.r)
  const cells: Array<[number, number, number]> = []
  for (let dx = 0; dx < fx; dx++) {
    for (let dy = 0; dy < part.h; dy++) {
      for (let dz = 0; dz < fz; dz++) {
        cells.push([brick.x + dx, brick.y + dy, brick.z + dz])
      }
    }
  }
  return cells
}

/** True when rotating the part to `a` or `b` yields the same look and footprint. */
export function rotEquivalent(part: PartDef, a: Rot, b: Rot): boolean {
  if (part.sym === 4) return true
  if (part.sym === 2) return a % 2 === b % 2
  return a === b
}

export function nextRot(r: Rot): Rot {
  return ((r + 1) % 4) as Rot
}

/** World-space center of the brick's bounding box. */
export function brickCenter(brick: Brick): [number, number, number] {
  const part = getPart(brick.p)
  const { fx, fz } = footprint(part, brick.r)
  return [
    brick.x + fx / 2,
    platesToWorld(brick.y) + platesToWorld(part.h) / 2,
    brick.z + fz / 2,
  ]
}
