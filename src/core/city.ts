import { roadKey } from './roads'
import type { Baseplate, CityPlacement, CityState, Rot } from './types'

/** Studs per city cell. */
export const CELL = 8

/**
 * Why a placement (or a painted cell) is refused: off the map, on another model, on a road, on a
 * rail, on water (or, for a `water` model, with no water under it at all), or a road and a rail
 * meeting anywhere but at a straight level crossing.
 */
export type PlaceError = 'out_of_bounds' | 'overlap' | 'road' | 'rail' | 'water' | 'crossing'

/** Tag of templates / blueprints that belong on water (bridges, islands, boats). */
export const WATER_TAG = 'water'

/**
 * What the city rules need to know about a model: its plate, and whether it is a `water` model
 * (tagged `WATER_TAG`): those sit on water, or straddle water and land, and never on dry land only.
 */
export interface SourceSize extends Baseplate {
  water?: boolean
}

/** A model's `SourceSize` from its plate and tags (the plate itself when it is not a water model). */
export function sourceSize(baseplate: Baseplate, tags: readonly string[]): SourceSize {
  return tags.includes(WATER_TAG) ? { ...baseplate, water: true } : baseplate
}

type SizeOf = (source: string) => SourceSize

/** Smallest and biggest size multiplier of a placement (`CityPlacement.s`). */
export const MIN_SCALE = 1
export const MAX_SCALE = 10

/** A placement's size multiplier (absent = 1). */
export const scaleOf = (p: Pick<CityPlacement, 's'>): number => p.s ?? MIN_SCALE

/**
 * A stored size multiplier made safe: numbers are rounded and clamped into MIN_SCALE..MAX_SCALE,
 * anything else (absent, NaN, a string...) is 1.
 */
export function normalizeScale(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return MIN_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v)))
}

/** Whether `v` is a valid stored size multiplier: an integer in MIN_SCALE..MAX_SCALE. */
export const isScale = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= MIN_SCALE && v <= MAX_SCALE

/** The plate a model covers when drawn `s` times bigger (studs x s). */
export function scaledBaseplate(baseplate: Baseplate, s: number): Baseplate {
  return s === 1 ? baseplate : { ...baseplate, w: baseplate.w * s, d: baseplate.d * s }
}

/** Footprint of a baseplate in city cells for the given rotation (w/d swapped for odd rot). */
export function footprintCells(baseplate: Baseplate, rot: Rot): { cw: number; cd: number } {
  const cw = Math.ceil(baseplate.w / CELL)
  const cd = Math.ceil(baseplate.d / CELL)
  return rot % 2 === 1 ? { cw: cd, cd: cw } : { cw, cd }
}

/**
 * Footprint in cells of a placement of a model on `baseplate`: rotated, and `s` times bigger (a
 * scaled placement covers the cells an unscaled model on a plate `s` times as big would).
 */
export function placementCells(p: Pick<CityPlacement, 'rot' | 's'>, baseplate: Baseplate): { cw: number; cd: number } {
  return footprintCells(scaledBaseplate(baseplate, scaleOf(p)), p.rot)
}

function cellsOf(p: CityPlacement, sizeOf: SizeOf): { cw: number; cd: number } {
  return placementCells(p, sizeOf(p.source))
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
  const rails = new Set(city.rails ?? [])
  const water = new Set(city.terrain?.water ?? [])
  let wet = 0
  for (let x = cx; x < cx + cw; x++) {
    for (let z = cz; z < cz + cd; z++) {
      const key = roadKey(x, z)
      if (roads.has(key)) return 'road'
      if (rails.has(key)) return 'rail'
      if (water.has(key)) wet++
    }
  }
  // Ordinary models stay on dry land; water models need some water under them.
  const waterModel = sizeOf(placement.source).water === true
  if (waterModel ? wet === 0 : wet > 0) return 'water'
  return null
}

/** Every cell covered by a placement (optionally only those `which` accepts), as "cx,cz" keys. */
export function coveredCells(city: CityState, sizeOf: SizeOf, which?: (p: CityPlacement) => boolean): Set<string> {
  const covered = new Set<string>()
  for (const p of city.placements) {
    if (which && !which(p)) continue
    const { cw, cd } = cellsOf(p, sizeOf)
    for (let x = p.cx; x < p.cx + cw; x++) {
      for (let z = p.cz; z < p.cz + cd; z++) covered.add(roadKey(x, z))
    }
  }
  return covered
}

/** Whether (cx, cz) is a cell of the city grid. */
export const inGrid = (city: Pick<CityState, 'size'>, cx: number, cz: number): boolean =>
  Number.isInteger(cx) && Number.isInteger(cz) && cx >= 0 && cz >= 0 && cx < city.size && cz < city.size

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

/**
 * `p` drawn at size `s` (clamped into MIN_SCALE..MAX_SCALE), growing / shrinking in place: the
 * footprint keeps its centre (an odd change in cells grows towards -X / -Z and shrinks back
 * exactly), then slides back inside the grid if it would hang over an edge. `s` = 1 drops the field.
 */
export function scaledPlacement(city: CityState, p: CityPlacement, s: number, sizeOf: SizeOf): CityPlacement {
  const scale = normalizeScale(s)
  const baseplate = sizeOf(p.source)
  const from = placementCells(p, baseplate)
  const to = placementCells({ rot: p.rot, s: scale }, baseplate)
  const slide = (v: number, span: number) => Math.max(0, Math.min(city.size - span, v))
  const { s: _old, ...rest } = p
  void _old
  return {
    ...rest,
    cx: slide(p.cx + Math.trunc((from.cw - to.cw) / 2), to.cw),
    cz: slide(p.cz + Math.trunc((from.cd - to.cd) / 2), to.cd),
    ...(scale === MIN_SCALE ? {} : { s: scale }),
  }
}

/**
 * Resizes placement `id` to `s` (see `scaledPlacement`). `error` says why it is refused (the bigger
 * model would not fit the city, or would cover another model or a road); the city is then null.
 */
export function scalePlacement(
  city: CityState,
  id: string,
  s: number,
  sizeOf: SizeOf,
): { city: CityState | null; error: PlaceError | null } {
  const current = city.placements.find((p) => p.id === id)
  if (!current) return { city: null, error: 'out_of_bounds' }
  const updated = scaledPlacement(city, current, s, sizeOf)
  const error = canPlaceInCity(city, updated, sizeOf, id)
  if (error !== null) return { city: null, error }
  return { city: { ...city, placements: city.placements.map((p) => (p.id === id ? updated : p)) }, error: null }
}

/**
 * Add road cells, silently skipping cells outside the grid, covered by a placement or on water.
 * Level crossings are not checked here (see `paintRoads` in core/rails).
 */
export function addRoads(city: CityState, keys: string[], sizeOf: SizeOf): CityState {
  const covered = coveredCells(city, sizeOf)
  const water = new Set(city.terrain?.water ?? [])
  const roads = new Set(city.roads)
  for (const key of keys) {
    const [cx, cz] = key.split(',').map(Number)
    if (!inGrid(city, cx, cz)) continue
    if (covered.has(key) || water.has(key)) continue
    roads.add(key)
  }
  return { ...city, roads: [...roads] }
}
