import { CELL, canPlaceInCity, footprintCells, placementCells, type PlaceError } from './city'
import { roadKey } from './roads'
import type { Baseplate, CityPlacement, CityState, Rot } from './types'

/**
 * Helpers for the City editor's pointer input: world points (studs) -> cells, where a tapped model
 * goes and which way it faces. Models face -Z at rot 0 (doors, vehicle noses).
 */

type SizeOf = (source: string) => Baseplate

export interface Cell {
  cx: number
  cz: number
}

/** The cell containing world point (x, z). */
export function pointToCell(x: number, z: number): Cell {
  return { cx: Math.floor(x / CELL), cz: Math.floor(z / CELL) }
}

export function clampCell(cell: Cell, size: number): Cell {
  const clamp = (v: number) => Math.max(0, Math.min(size - 1, v))
  return { cx: clamp(cell.cx), cz: clamp(cell.cz) }
}

/** Min corner of a cw x cd footprint whose centre is as close as possible to world point (x, z). */
export function footprintOrigin(x: number, z: number, cw: number, cd: number): Cell {
  return { cx: Math.round(x / CELL - cw / 2), cz: Math.round(z / CELL - cd / 2) }
}

/** Number of road cells right in front of a footprint (the side its rot faces). */
export function frontRoadCount(roads: Set<string>, cx: number, cz: number, cw: number, cd: number, rot: Rot): number {
  let count = 0
  if (rot % 2 === 0) {
    const z = rot === 0 ? cz - 1 : cz + cd
    for (let x = cx; x < cx + cw; x++) if (roads.has(roadKey(x, z))) count++
  } else {
    const x = rot === 1 ? cx - 1 : cx + cw
    for (let z = cz; z < cz + cd; z++) if (roads.has(roadKey(x, z))) count++
  }
  return count
}

export interface PlacementPlan {
  cx: number
  cz: number
  rot: Rot
  /** Size multiplier of the model being placed (absent = 1, as on a placement). */
  s?: number
  error: PlaceError | null
}

/** Preference among equally good rotations: towards the camera (+Z) first. */
const ROT_ORDER: Rot[] = [2, 0, 1, 3]

/**
 * Where a model tapped at world point (x, z) goes: centred on the point (slid inside the grid),
 * turned so its front faces the most adjacent road. Without a road it faces +Z (towards the default
 * camera), or the first rotation that fits. `error` is set when no rotation fits.
 */
export function planPlacement(city: CityState, source: string, x: number, z: number, sizeOf: SizeOf): PlacementPlan {
  const roads = new Set(city.roads)
  const baseplate = sizeOf(source)
  let best: { plan: PlacementPlan; score: number } | null = null
  let fallback: PlacementPlan | null = null
  for (const rot of ROT_ORDER) {
    const { cw, cd } = footprintCells(baseplate, rot)
    const o = footprintOrigin(x, z, cw, cd)
    const cx = Math.max(0, Math.min(city.size - cw, o.cx))
    const cz = Math.max(0, Math.min(city.size - cd, o.cz))
    const error = canPlaceInCity(city, { id: '__plan__', source, cx, cz, rot }, sizeOf)
    const plan: PlacementPlan = { cx, cz, rot, error }
    fallback ??= plan
    if (error !== null) continue
    const score = frontRoadCount(roads, cx, cz, cw, cd, rot)
    if (best === null || score > best.score) best = { plan, score }
  }
  return best?.plan ?? (fallback as PlacementPlan)
}

/** World-space centre (studs) of a placement's rotated (and scaled) footprint. */
export function placementCenter(p: Pick<CityPlacement, 'cx' | 'cz' | 'rot' | 's'>, baseplate: Baseplate): { x: number; z: number } {
  const { cw, cd } = placementCells(p, baseplate)
  return { x: (p.cx + cw / 2) * CELL, z: (p.cz + cd / 2) * CELL }
}

/** The cells on the straight (Bresenham) line from `from` to `to`, both ends included. */
export function cellsOnLine(from: Cell, to: Cell): Cell[] {
  const dx = Math.abs(to.cx - from.cx)
  const dz = -Math.abs(to.cz - from.cz)
  const sx = Math.sign(to.cx - from.cx)
  const sz = Math.sign(to.cz - from.cz)
  let { cx, cz } = from
  let err = dx + dz
  const cells: Cell[] = [{ cx, cz }]
  while (cx !== to.cx || cz !== to.cz) {
    const e2 = 2 * err
    if (e2 >= dz) {
      err += dz
      cx += sx
    }
    if (e2 <= dx) {
      err += dx
      cz += sz
    }
    cells.push({ cx, cz })
  }
  return cells
}

/** The city without those of `keys` that are roads; null when none of them is. */
export function removeRoads(city: CityState, keys: Iterable<string>): CityState | null {
  const gone = new Set(keys)
  const roads = city.roads.filter((k) => !gone.has(k))
  return roads.length === city.roads.length ? null : { ...city, roads }
}

/**
 * Where moving `placement` so its footprint is centred on world point (x, z) puts it: same rotation
 * and size, slid inside the grid; `error` says why it cannot go there (the placement itself is not
 * in the way).
 */
export function planMove(city: CityState, placement: CityPlacement, x: number, z: number, sizeOf: SizeOf): PlacementPlan {
  const { cw, cd } = placementCells(placement, sizeOf(placement.source))
  const o = footprintOrigin(x, z, cw, cd)
  const cx = Math.max(0, Math.min(city.size - cw, o.cx))
  const cz = Math.max(0, Math.min(city.size - cd, o.cz))
  const error = canPlaceInCity(city, { ...placement, cx, cz }, sizeOf, placement.id)
  return { cx, cz, rot: placement.rot, ...(placement.s === undefined ? {} : { s: placement.s }), error }
}

/**
 * Where a copy of `placement` (same source, rotation and size) goes: the first free spot right next to it,
 * trying +X, -X, +Z, -Z, then the four corners, then one footprint further out (+X, -X, +Z, -Z).
 * Null when none of them fits.
 */
export function duplicateCell(city: CityState, placement: CityPlacement, sizeOf: SizeOf): Cell | null {
  const { cw, cd } = placementCells(placement, sizeOf(placement.source))
  const steps: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2],
  ]
  for (const [sx, sz] of steps) {
    const cell = { cx: placement.cx + sx * cw, cz: placement.cz + sz * cd }
    if (canPlaceInCity(city, { ...placement, id: '__copy__', ...cell }, sizeOf) === null) return cell
  }
  return null
}
