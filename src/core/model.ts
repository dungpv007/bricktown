import { figOf, isFigure, withTorso } from './figures'
import { Occupancy } from './occupancy'
import { getPart } from './parts/catalog'
import { centredOn, hitFace, targetAnchor, type PickHit } from './pick'
import { footprint, nextRot } from './rotation'
import type { Baseplate, Brick, FigStyle, PartDef, Rot } from './types'
import { platesToWorld } from './units'

/** Build height limit: 48 bricks, so towers like the skyscraper template fit. */
export const MAX_HEIGHT_PLATES = 144
export const MAX_BRICKS = 1500

export type PlaceError = 'collision' | 'unsupported' | 'out_of_bounds' | 'limit'

/** `occupancy`: a prebuilt Occupancy of `bricks` (without `ignoreId`), for callers checking many bricks against one set. */
export function canPlace(
  bricks: Brick[],
  brick: Brick,
  baseplate: Baseplate,
  ignoreId?: string,
  occupancy?: Occupancy,
): PlaceError | null {
  const part = getPart(brick.p)
  const { fx, fz } = footprint(part, brick.r)
  if (
    brick.x < 0 || brick.z < 0 || brick.y < 0 ||
    brick.x + fx > baseplate.w ||
    brick.z + fz > baseplate.d ||
    brick.y + part.h > MAX_HEIGHT_PLATES
  ) {
    return 'out_of_bounds'
  }
  if (ignoreId === undefined && bricks.length >= MAX_BRICKS) return 'limit'
  const occ = occupancy ?? Occupancy.from(ignoreId === undefined ? bricks : bricks.filter((b) => b.id !== ignoreId))
  if (occ.collides(brick)) return 'collision'
  if (!occ.isSupported(brick)) return 'unsupported'
  return null
}

export interface PlaceResult { bricks: Brick[]; error: PlaceError | null }

export function addBrick(bricks: Brick[], brick: Brick, baseplate: Baseplate): PlaceResult {
  const error = canPlace(bricks, brick, baseplate)
  return error ? { bricks, error } : { bricks: [...bricks, brick], error: null }
}

/** Removes only the given brick; bricks left floating stay put. */
export function removeBrick(bricks: Brick[], id: string): Brick[] {
  return bricks.filter((b) => b.id !== id)
}

/** Recolours a brick; painting a figure recolours its torso (a see-through colour: the nearest solid). */
export function paintBrick(bricks: Brick[], id: string, c: number): Brick[] {
  return bricks.map((b) => {
    if (b.id !== id) return b
    if (!isFigure(b)) return { ...b, c }
    const fig = withTorso(figOf(b), c)
    return { ...b, c: fig.torso, fig }
  })
}

/** Gives figure `id` a new style (its `c` follows the torso colour); other bricks are left alone. */
export function restyleFigure(bricks: Brick[], id: string, fig: FigStyle): Brick[] {
  const target = bricks.find((b) => b.id === id)
  if (!target || !isFigure(target)) return bricks
  return bricks.map((b) => (b === target ? { ...b, c: fig.torso, fig: { ...fig } } : b))
}

function replaceBrick(
  bricks: Brick[],
  id: string,
  change: (b: Brick) => Brick,
  baseplate: Baseplate,
): PlaceResult {
  const current = bricks.find((b) => b.id === id)
  if (!current) return { bricks, error: null }
  const updated = change(current)
  const error = canPlace(bricks, updated, baseplate, id)
  if (error) return { bricks, error }
  return { bricks: bricks.map((b) => (b.id === id ? updated : b)), error: null }
}

export function rotateBrick(bricks: Brick[], id: string, baseplate: Baseplate): PlaceResult {
  return replaceBrick(bricks, id, (b) => ({ ...b, r: nextRot(b.r) }), baseplate)
}

export function moveBrick(
  bricks: Brick[],
  id: string,
  to: { x: number; y: number; z: number },
  baseplate: Baseplate,
): PlaceResult {
  return replaceBrick(bricks, id, (b) => ({ ...b, x: to.x, y: to.y, z: to.z }), baseplate)
}

export interface Bounds {
  minX: number; minY: number; minZ: number
  maxX: number; maxY: number; maxZ: number
}

/** Bounding box in studs/plates; max values are exclusive. */
export function bounds(bricks: Brick[]): Bounds | null {
  if (bricks.length === 0) return null
  const out: Bounds = {
    minX: Infinity, minY: Infinity, minZ: Infinity,
    maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
  }
  for (const b of bricks) {
    const part = getPart(b.p)
    const { fx, fz } = footprint(part, b.r)
    out.minX = Math.min(out.minX, b.x)
    out.minY = Math.min(out.minY, b.y)
    out.minZ = Math.min(out.minZ, b.z)
    out.maxX = Math.max(out.maxX, b.x + fx)
    out.maxY = Math.max(out.maxY, b.y + part.h)
    out.maxZ = Math.max(out.maxZ, b.z + fz)
  }
  return out
}


type Anchor = { x: number; y: number; z: number }

/** Slack on the ray parameter so a plane exactly at the hit (a plate or top-face hit) still counts. */
const RAY_EPS = 1e-9

/**
 * The top of the highest brick in every column (stud cell) of the plate, 0 where it is empty, and every
 * level a brick top is at. One pass over the bricks; `excludeId` (a brick being moved) does not count.
 * `restOn` is where a footprint with min corner (x, z) comes to rest when lowered from above.
 */
function columnTops(bricks: Brick[], baseplate: Baseplate, excludeId?: string) {
  const { w, d } = baseplate
  const tops = new Uint16Array(w * d)
  const levels = new Set<number>([0])
  for (const b of bricks) {
    if (b.id === excludeId) continue
    const part = getPart(b.p)
    const { fx, fz } = footprint(part, b.r)
    const top = b.y + part.h
    levels.add(top)
    for (let x = Math.max(0, b.x); x < Math.min(w, b.x + fx); x++) {
      for (let z = Math.max(0, b.z); z < Math.min(d, b.z + fz); z++) {
        if (tops[x * d + z] < top) tops[x * d + z] = top
      }
    }
  }
  const restOn = (x: number, z: number, fx: number, fz: number): number => {
    let y = 0
    for (let cx = Math.max(0, x); cx < Math.min(w, x + fx); cx++) {
      for (let cz = Math.max(0, z); cz < Math.min(d, z + fz); cz++) y = Math.max(y, tops[cx * d + cz])
    }
    return y
  }
  return { levels, restOn }
}

/**
 * Where a `part` aimed at `anchor` comes to rest when lowered from above, like a real brick: on the highest
 * studs under its whole footprint. y = max(0, the top of every brick sharing a column with the footprint);
 * x and z never change and the anchor's own y does not matter. So a long brick over a gap between two
 * supports bridges them, resting on the taller one. `excludeId` (a brick being moved) does not count.
 * The result is not checked: off the plate, over the height limit or past the brick limit, `canPlace`
 * still reports the usual error.
 */
export function settleAnchor(
  bricks: Brick[],
  part: PartDef,
  r: Rot,
  anchor: Anchor,
  baseplate: Baseplate,
  excludeId?: string,
): Anchor {
  const { fx, fz } = footprint(part, r)
  const y = columnTops(bricks, baseplate, excludeId).restOn(anchor.x, anchor.z, fx, fz)
  return { x: anchor.x, y, z: anchor.z }
}

/**
 * Where a part dropped through the pointer ray of `hit` goes (the Workshop's ghost, tap, palette drop and
 * move all use this): lowered from above, under the pointer.
 *  1. A hit on a brick's underside keeps placing under it (`targetAnchor`) when `canPlace` accepts that.
 *  2. Otherwise, walking along the ray from the camera to the hit: the first brick-top level L (or the
 *     plate) where the footprint centred under the ray would rest at exactly L, on the plate and under the
 *     height limit. Aimed over a gap between two supports, the ray passes above the gap at the height of
 *     their tops, so the brick bridges them, although the ray itself goes on to hit the plate behind them.
 *  3. Failing that (or with no ray origin): `targetAnchor`'s x/z at the `settleAnchor` level.
 * Every level costs one footprint lookup in a column-top map built in one pass over the bricks.
 */
export function pointerAnchor(
  bricks: Brick[],
  hit: PickHit,
  part: PartDef,
  r: Rot,
  baseplate: Baseplate,
  excludeId?: string,
): Anchor {
  const target = targetAnchor(hit, part, r)
  if (hitFace(hit) === 'bottom') {
    const under = { id: '', p: part.id, r, c: 0, ...target }
    if (canPlace(bricks, under, baseplate, excludeId) === null) return target
  }
  const { fx, fz } = footprint(part, r)
  const { levels, restOn } = columnTops(bricks, baseplate, excludeId)
  const o = hit.origin
  const [px, py, pz] = hit.point
  if (o && py !== o[1]) {
    // [t along the ray from origin (0) to hit (1), level] for the levels the ray crosses up to the hit.
    const crossings: Array<[number, number]> = []
    for (const level of levels) {
      if (level + part.h > MAX_HEIGHT_PLATES) continue
      const t = (platesToWorld(level) - o[1]) / (py - o[1])
      if (t > 0 && t <= 1 + RAY_EPS) crossings.push([t, level])
    }
    crossings.sort((a, b) => a[0] - b[0])
    for (const [t, level] of crossings) {
      const at = centredOn(Math.floor(o[0] + (px - o[0]) * t), Math.floor(o[2] + (pz - o[2]) * t), part, r)
      if (at.x < 0 || at.z < 0 || at.x + fx > baseplate.w || at.z + fz > baseplate.d) continue
      if (restOn(at.x, at.z, fx, fz) === level) return { x: at.x, y: level, z: at.z }
    }
  }
  return { x: target.x, y: restOn(target.x, target.z, fx, fz), z: target.z }
}
