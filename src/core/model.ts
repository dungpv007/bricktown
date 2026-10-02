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
 * The height spans of the bricks in every column (stud cell) of the plate, and every level a brick top is
 * at. One pass over the bricks; `excludeId` (a brick being moved) does not count. `under(x, z, fx, fz)`
 * answers questions about the columns under one footprint (min corner x, z; cells off the plate are empty).
 */
function columns(bricks: Brick[], baseplate: Baseplate, excludeId?: string) {
  const { w, d } = baseplate
  // Flat [bottom, top, bottom, top, ...] per occupied column.
  const spans: Array<number[] | undefined> = new Array(w * d)
  const levels = new Set<number>([0])
  for (const b of bricks) {
    if (b.id === excludeId) continue
    const part = getPart(b.p)
    const { fx, fz } = footprint(part, b.r)
    const top = b.y + part.h
    levels.add(top)
    for (let x = Math.max(0, b.x); x < Math.min(w, b.x + fx); x++) {
      for (let z = Math.max(0, b.z); z < Math.min(d, b.z + fz); z++) (spans[x * d + z] ??= []).push(b.y, top)
    }
  }

  const under = (x: number, z: number, fx: number, fz: number) => {
    const cols: number[][] = []
    for (let cx = Math.max(0, x); cx < Math.min(w, x + fx); cx++) {
      for (let cz = Math.max(0, z); cz < Math.min(d, z + fz); cz++) {
        const s = spans[cx * d + cz]
        if (s) cols.push(s)
      }
    }
    /** No brick in these columns overlaps plates [y, y + h). */
    const free = (y: number, h: number) => cols.every((s) => {
      for (let i = 0; i < s.length; i += 2) if (s[i] < y + h && y < s[i + 1]) return false
      return true
    })
    /** Lowered from above to level `y`, a part of height `h` lands there: studs at exactly `y` (or the plate), and room. */
    const landsAt = (y: number, h: number) => {
      let highest = 0
      for (const s of cols) for (let i = 1; i < s.length; i += 2) if (s[i] <= y && s[i] > highest) highest = s[i]
      return highest === y && free(y, h)
    }
    /** The supported levels at or above `from`, lowest first: the plate and the brick tops in these columns. */
    const restingLevels = (from: number) => {
      const out = new Set<number>(from <= 0 ? [0] : [])
      for (const s of cols) for (let i = 1; i < s.length; i += 2) if (s[i] >= from) out.add(s[i])
      return [...out].sort((a, b) => a - b)
    }
    return { free, landsAt, restingLevels }
  }
  return { levels, under }
}

/**
 * Where a dropped `part` really goes from the pointer's `anchor`: moved straight up (x and z never change)
 * to the lowest free, supported level at or above max(0, anchor.y), so dropping onto studs that are already
 * taken stacks on top of what is there. It only climbs on a collision: bricks somewhere above (a roof) do not
 * pull it up. An accepted anchor comes back as it is. When nothing fits (off the plate, over the height
 * limit, nothing to rest on, brick limit reached) the original anchor comes back, so the caller reports the
 * usual error. `excludeId` is a brick being moved, which does not count as an obstacle.
 */
export function settleAnchor(
  bricks: Brick[],
  part: PartDef,
  r: Rot,
  anchor: Anchor,
  baseplate: Baseplate,
  excludeId?: string,
): Anchor {
  return settleIn(columns(bricks, baseplate, excludeId), bricks, part, r, anchor, baseplate, excludeId)
}

function settleIn(
  cols: ReturnType<typeof columns>,
  bricks: Brick[],
  part: PartDef,
  r: Rot,
  anchor: Anchor,
  baseplate: Baseplate,
  excludeId?: string,
): Anchor {
  const { fx, fz } = footprint(part, r)
  const { x, z } = anchor
  if (x < 0 || z < 0 || x + fx > baseplate.w || z + fz > baseplate.d) return anchor
  if (excludeId === undefined && bricks.length >= MAX_BRICKS) return anchor
  const { free, restingLevels } = cols.under(x, z, fx, fz)
  for (const y of restingLevels(Math.max(0, anchor.y))) {
    if (y + part.h > MAX_HEIGHT_PLATES) break
    if (free(y, part.h)) return y === anchor.y ? anchor : { x, y, z }
  }
  return anchor
}

/**
 * Where a part dropped through the pointer ray of `hit` goes (the Workshop's ghost, tap, palette drop and
 * move all use this): lowered from above, under the pointer.
 *  1. A hit on a brick's underside keeps placing under it (`targetAnchor`) when `canPlace` accepts that.
 *  2. Otherwise, walking along the ray from the camera to the hit: the first brick-top level L (or the plate)
 *     where the footprint centred under the ray, lowered from L, lands at L: on the plate, under the height
 *     limit, on studs at exactly L (bricks wholly above L, like a roof, do not count) and with room there.
 *     Aimed over a gap between two supports, the ray passes above the gap at the height of their tops, so the
 *     brick bridges them, although the ray itself goes on to hit the plate behind them. A floor hit inside a
 *     roofed house, seen through a door, is accepted at y = 0.
 *  3. Failing that (or with no ray origin): `targetAnchor`, settled up from its own level (`settleAnchor`).
 * Each level costs one footprint lookup in column spans built in one pass over the bricks.
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
  const cols = columns(bricks, baseplate, excludeId)
  const o = hit.origin
  const [px, py, pz] = hit.point
  if (o && py !== o[1] && !(excludeId === undefined && bricks.length >= MAX_BRICKS)) {
    const { fx, fz } = footprint(part, r)
    // [t along the ray from origin (0) to hit (1), level] for the levels the ray crosses up to the hit.
    const crossings: Array<[number, number]> = []
    for (const level of cols.levels) {
      if (level + part.h > MAX_HEIGHT_PLATES) continue
      const t = (platesToWorld(level) - o[1]) / (py - o[1])
      if (t > 0 && t <= 1 + RAY_EPS) crossings.push([t, level])
    }
    crossings.sort((a, b) => a[0] - b[0])
    for (const [t, level] of crossings) {
      const at = centredOn(Math.floor(o[0] + (px - o[0]) * t), Math.floor(o[2] + (pz - o[2]) * t), part, r)
      if (at.x < 0 || at.z < 0 || at.x + fx > baseplate.w || at.z + fz > baseplate.d) continue
      if (cols.under(at.x, at.z, fx, fz).landsAt(level, part.h)) return { x: at.x, y: level, z: at.z }
    }
  }
  return settleIn(cols, bricks, part, r, target, baseplate, excludeId)
}

/**
 * Where `brick` goes when nudged by (dx, dz) studs (the arrow keys): x and z follow the step, y is where it
 * rests there, not counting itself. Free at its own level, it is lowered from there onto the highest studs
 * (or the plate) below its footprint, so it steps down off a brick and a roof overhead does not pull it up.
 * Blocked at its own level, it climbs to the lowest free, supported level above, onto what is in the way.
 * Off the plate, over the height limit or with nowhere to rest, the stepped spot comes back at its own
 * height, so `canPlace` reports the usual error.
 */
export function stepAnchor(bricks: Brick[], brick: Brick, dx: number, dz: number, baseplate: Baseplate): Anchor {
  const part = getPart(brick.p)
  const { fx, fz } = footprint(part, brick.r)
  const x = brick.x + dx
  const z = brick.z + dz
  const stepped = { x, y: brick.y, z }
  if (x < 0 || z < 0 || x + fx > baseplate.w || z + fz > baseplate.d) return stepped
  const cols = columns(bricks, baseplate, brick.id)
  const { free, restingLevels } = cols.under(x, z, fx, fz)
  if (free(brick.y, part.h)) {
    // Nothing in the way at this level: lower it to the highest level at or below it. A brick top above
    // belongs to a brick that starts above this one's own top, so the level below is always free.
    const below = restingLevels(0).filter((y) => y <= brick.y)
    return { x, y: below[below.length - 1], z }
  }
  return settleIn(cols, bricks, part, brick.r, stepped, baseplate, brick.id)
}
