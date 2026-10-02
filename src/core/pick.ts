import { getPart } from './parts/catalog'
import { footprint, QUARTER_COS, QUARTER_SIN } from './rotation'
import type { Brick, PartDef, Rot } from './types'
import { platesToWorld } from './units'

export type Vec3 = [number, number, number]

/** A pointer ray hit in world space. `brick` is null for the baseplate. */
export interface PickHit {
  point: Vec3
  /** World-space face normal (see `rotateNormalY` for bricks). */
  normal: Vec3
  brick: Brick | null
  /** Where the pointer ray starts (the camera). Lets a drop follow the ray above the hit, see `pointerAnchor`. */
  origin?: Vec3
}

/** Which face the ray hit: the baseplate, or a brick's top (studs, slopes), bottom or side. */
export type HitFace = 'plate' | 'top' | 'bottom' | 'side'

/** Tolerance (world units) for treating a hit at/above a brick's top as the top face (stud sides). */
const TOP_EPS = 0.01

/**
 * Rotates a part-space normal into world space for a brick rotated `r` quarter turns
 * (same convention as mesh `rotation.y = r * PI / 2`). Exact for quarter turns.
 */
export function rotateNormalY([x, y, z]: Vec3, r: Rot): Vec3 {
  const c = QUARTER_COS[r]
  const s = QUARTER_SIN[r]
  // `+ 0` turns -0 into 0.
  return [x * c + z * s + 0, y, -x * s + z * c + 0]
}

export function hitFace(hit: PickHit): HitFace {
  const b = hit.brick
  if (!b) return 'plate'
  if (hit.normal[1] > 0.5 || hit.point[1] >= platesToWorld(b.y + getPart(b.p).h) - TOP_EPS) return 'top'
  return hit.normal[1] < -0.5 ? 'bottom' : 'side'
}

/** The min corner (x, z) of `part` at rotation `r` with its rotated footprint centred on cell (cellX, cellZ). */
export function centredOn(cellX: number, cellZ: number, part: PartDef, r: Rot): { x: number; z: number } {
  const { fx, fz } = footprint(part, r)
  return { x: cellX - Math.floor((fx - 1) / 2), z: cellZ - Math.floor((fz - 1) / 2) }
}

/**
 * Where a new `part` at rotation `r` goes when the pointer hits `hit`: the min corner (x, z) in
 * studs and bottom plate y. The rotated footprint is centred on the target cell. `y` may be
 * negative for hits under a brick near the ground; the caller rejects that via `canPlace`.
 */
export function targetAnchor(hit: PickHit, part: PartDef, r: Rot): { x: number; y: number; z: number } {
  const [px, , pz] = hit.point
  const [nx, , nz] = hit.normal
  let cellX = Math.floor(px)
  let cellZ = Math.floor(pz)
  let y = 0

  const b = hit.brick
  const face = hitFace(hit)
  if (b && face === 'top') {
    y = b.y + getPart(b.p).h
  } else if (b && face === 'bottom') {
    y = b.y - part.h
  } else if (b) {
    y = b.y
    cellX = Math.floor(px + nx * 0.5)
    cellZ = Math.floor(pz + nz * 0.5)
  }

  return { ...centredOn(cellX, cellZ, part, r), y }
}
