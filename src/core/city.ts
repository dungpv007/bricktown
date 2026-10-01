import { roadKey } from './roads'
import type { Baseplate, CityPlacement, CityState, Rot } from './types'

/** Studs per city cell. */
export const CELL = 8

export type PlaceError = 'out_of_bounds' | 'overlap' | 'road'

type SizeOf = (source: string) => Baseplate

/** Footprint of a baseplate in city cells for the given rotation (w/d swapped for odd rot). */
export function footprintCells(baseplate: Baseplate, rot: Rot): { cw: number; cd: number } {
  const cw = Math.ceil(baseplate.w / CELL)
  const cd = Math.ceil(baseplate.d / CELL)
  return rot % 2 === 1 ? { cw: cd, cd: cw } : { cw, cd }
}

function cellsOf(p: CityPlacement, sizeOf: SizeOf): { cw: number; cd: number } {
  return footprintCells(sizeOf(p.source), p.rot)
}

export function canPlaceInCity(
  city: CityState,
  placement: CityPlacement,
  sizeOf: SizeOf,
  ignoreId?: string,
): PlaceError | null {
  const { cw, cd } = cellsOf(placement, sizeOf)
  const { cx, cz } = placement
  if (cx < 0 || cz < 0 || cx + cw > city.size || cz + cd > city.size) return 'out_of_bounds'

  for (const other of city.placements) {
    if (other.id === ignoreId) continue
    const o = cellsOf(other, sizeOf)
    if (cx < other.cx + o.cw && other.cx < cx + cw && cz < other.cz + o.cd && other.cz < cz + cd) {
      return 'overlap'
    }
  }

  const roads = new Set(city.roads)
  for (let x = cx; x < cx + cw; x++) {
    for (let z = cz; z < cz + cd; z++) {
      if (roads.has(roadKey(x, z))) return 'road'
    }
  }
  return null
}

/** Returns the new city, or null if the placement is not allowed. */
export function addPlacement(
  city: CityState,
  placement: CityPlacement,
  sizeOf: SizeOf,
): CityState | null {
  if (canPlaceInCity(city, placement, sizeOf) !== null) return null
  return { ...city, placements: [...city.placements, placement] }
}

export function removePlacement(city: CityState, id: string): CityState {
  return { ...city, placements: city.placements.filter((p) => p.id !== id) }
}

function replacePlacement(
  city: CityState,
  id: string,
  change: (p: CityPlacement) => CityPlacement,
  sizeOf: SizeOf,
): CityState | null {
  const current = city.placements.find((p) => p.id === id)
  if (!current) return null
  const updated = change(current)
  if (canPlaceInCity(city, updated, sizeOf, id) !== null) return null
  return { ...city, placements: city.placements.map((p) => (p.id === id ? updated : p)) }
}

/** Rotate one quarter turn counter-clockwise keeping the min corner; null if it no longer fits. */
export function rotatePlacement(city: CityState, id: string, sizeOf: SizeOf): CityState | null {
  return replacePlacement(city, id, (p) => ({ ...p, rot: ((p.rot + 1) % 4) as Rot }), sizeOf)
}

/** Move to a new min-corner cell; null if the target is invalid. */
export function movePlacement(
  city: CityState,
  id: string,
  cx: number,
  cz: number,
  sizeOf: SizeOf,
): CityState | null {
  return replacePlacement(city, id, (p) => ({ ...p, cx, cz }), sizeOf)
}

/** Add road cells, silently skipping cells outside the grid or covered by a placement. */
export function addRoads(city: CityState, keys: string[], sizeOf: SizeOf): CityState {
  const covered = new Set<string>()
  for (const p of city.placements) {
    const { cw, cd } = cellsOf(p, sizeOf)
    for (let x = p.cx; x < p.cx + cw; x++) {
      for (let z = p.cz; z < p.cz + cd; z++) covered.add(roadKey(x, z))
    }
  }
  const roads = new Set(city.roads)
  for (const key of keys) {
    const [cx, cz] = key.split(',').map(Number)
    if (!(cx >= 0 && cz >= 0 && cx < city.size && cz < city.size)) continue
    if (covered.has(key)) continue
    roads.add(key)
  }
  return { ...city, roads: [...roads] }
}
