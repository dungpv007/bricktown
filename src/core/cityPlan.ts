import { CELL, canPlaceInCity, footprintCells, type PlaceError } from './city'
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

/** World-space centre (studs) of a placement's rotated footprint. */
export function placementCenter(p: Pick<CityPlacement, 'cx' | 'cz' | 'rot'>, baseplate: Baseplate): { x: number; z: number } {
  const { cw, cd } = footprintCells(baseplate, p.rot)
  return { x: (p.cx + cw / 2) * CELL, z: (p.cz + cd / 2) * CELL }
}

/** The city without the road at (cx, cz); null when there is no road there. */
export function removeRoad(city: CityState, cx: number, cz: number): CityState | null {
  const key = roadKey(cx, cz)
  if (!city.roads.includes(key)) return null
  return { ...city, roads: city.roads.filter((k) => k !== key) }
}
