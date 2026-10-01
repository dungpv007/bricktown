import { getPart } from './parts/catalog'
import { footprint } from './rotation'
import type { Brick, PartDef, Rot } from './types'
import { platesToWorld } from './units'

export type Vec3 = [number, number, number]

/** A pointer ray hit in world space. `brick` is null for the baseplate. */
export interface PickHit {
  point: Vec3
  /** World-space face normal (see `rotateNormalY` for bricks). */
  normal: Vec3
  brick: Brick | null
}

/** Tolerance (world units) for treating a hit at/above a brick's top as the top face (stud sides). */
const TOP_EPS = 0.01

const COS: readonly number[] = [1, 0, -1, 0]
const SIN: readonly number[] = [0, 1, 0, -1]

/**
 * Rotates a part-space normal into world space for a brick rotated `r` quarter turns
 * (same convention as mesh `rotation.y = r * PI / 2`). Exact for quarter turns.
 */
export function rotateNormalY([x, y, z]: Vec3, r: Rot): Vec3 {
  const c = COS[r]
  const s = SIN[r]
  // `+ 0` turns -0 into 0.
  return [x * c + z * s + 0, y, -x * s + z * c + 0]
}

/**
 * Where a new `part` at rotation `r` goes when the pointer hits `hit`: the min corner (x, z) in
 * studs and bottom plate y. The rotated footprint is centred on the target cell. `y` may be
 * negative for hits under a brick near the ground; the caller rejects that via `canPlace`.
 */
export function targetAnchor(hit: PickHit, part: PartDef, r: Rot): { x: number; y: number; z: number } {
  const [px, py, pz] = hit.point
  const [nx, ny, nz] = hit.normal
  let cellX = Math.floor(px)
  let cellZ = Math.floor(pz)
  let y = 0

  const b = hit.brick
  if (b) {
    const h = getPart(b.p).h
    const onTop = ny > 0.5 || py >= platesToWorld(b.y + h) - TOP_EPS
    if (onTop) {
      y = b.y + h
    } else if (ny < -0.5) {
      y = b.y - part.h
    } else {
      y = b.y
      cellX = Math.floor(px + nx * 0.5)
      cellZ = Math.floor(pz + nz * 0.5)
    }
  }

  const { fx, fz } = footprint(part, r)
  return {
    x: cellX - Math.floor((fx - 1) / 2),
    y,
    z: cellZ - Math.floor((fz - 1) / 2),
  }
}
