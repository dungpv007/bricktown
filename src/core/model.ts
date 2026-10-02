import { figOf, isFigure, withTorso } from './figures'
import { Occupancy } from './occupancy'
import { getPart } from './parts/catalog'
import { footprint, nextRot } from './rotation'
import type { Baseplate, Brick, FigStyle, PartDef, Rot } from './types'

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

/**
 * Where a dropped `part` really goes: the pointer's `anchor`, moved straight up (x and z never change)
 * to the lowest level where `canPlace` would accept it. Dropping onto studs that are already taken
 * therefore stacks on top of what is there. Climbing starts at max(0, anchor.y); an accepted anchor is
 * returned as it is. When nothing fits (off the plate, over the height limit, nothing to rest on,
 * brick limit reached) the original anchor comes back, so the caller reports the usual error.
 * `excludeId` is a brick being moved, which does not count as an obstacle.
 *
 * Works from the bricks that share a column with the footprint instead of a whole occupancy grid
 * (the Workshop calls this on every pointer move): a supported level is the ground or the top of one
 * of those bricks, so only those few levels are tried.
 */
export function settleAnchor(
  bricks: Brick[],
  part: PartDef,
  r: Rot,
  anchor: { x: number; y: number; z: number },
  baseplate: Baseplate,
  excludeId?: string,
): { x: number; y: number; z: number } {
  const { fx, fz } = footprint(part, r)
  const { x, z } = anchor
  if (x < 0 || z < 0 || x + fx > baseplate.w || z + fz > baseplate.d) return anchor
  if (excludeId === undefined && bricks.length >= MAX_BRICKS) return anchor

  // Height spans (bottom, top) of the bricks sharing a column with the footprint.
  const bottoms: number[] = []
  const tops: number[] = []
  for (const b of bricks) {
    if (b.id === excludeId) continue
    const bp = getPart(b.p)
    const f = footprint(bp, b.r)
    if (b.x < x + fx && x < b.x + f.fx && b.z < z + fz && z < b.z + f.fz) {
      bottoms.push(b.y)
      tops.push(b.y + bp.h)
    }
  }

  const from = Math.max(0, anchor.y)
  const levels = [0, ...tops].filter((y) => y >= from).sort((a, b) => a - b)
  for (const y of levels) {
    if (y + part.h > MAX_HEIGHT_PLATES) break
    let free = true
    for (let i = 0; i < bottoms.length; i++) {
      if (bottoms[i] < y + part.h && y < tops[i]) {
        free = false
        break
      }
    }
    if (free) return y === anchor.y ? anchor : { x, y, z }
  }
  return anchor
}
