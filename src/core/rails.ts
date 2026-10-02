import { addRoads, coveredCells, inGrid, type PlaceError, type SourceSize } from './city'
import { cellGraph, components, isLoop, parseKey, pathOrder, type CellGraph } from './cellGraph'
import { roadKey, roadTileAt, type RoadTile } from './roads'
import type { CityState, Rot } from './types'

/**
 * City railways: rail cells painted and erased like roads and auto-tiled from their 4 rail
 * neighbours (same tiles as roads: end, straight, corner, tee, cross). A cell that is a road and a
 * rail is a level crossing, allowed only where both are straights at right angles. Rails never lie
 * on water or under a model.
 */

type SizeOf = (source: string) => SourceSize

export type RailTile = RoadTile

/** Tile + rotation of the rail at (cx, cz), from its rail neighbours (see `roadTileAt`). */
export function railTileAt(rails: Set<string>, cx: number, cz: number): { tile: RailTile; rot: Rot } {
  return roadTileAt(rails, cx, cz)
}

/** The rail cells of a city. */
export const railCells = (city: Pick<CityState, 'rails'>): Set<string> => new Set(city.rails ?? [])

/**
 * Whether a cell that is both a road and a rail is a valid level crossing: the road tile and the
 * rail tile are both straights, one along X and the other along Z.
 */
export function isValidCrossing(roads: Set<string>, rails: Set<string>, cx: number, cz: number): boolean {
  const road = roadTileAt(roads, cx, cz)
  const rail = roadTileAt(rails, cx, cz)
  return road.tile === 'straight' && rail.tile === 'straight' && road.rot !== rail.rot
}

/** The level crossings of a city: the cells that are both road and rail ("cx,cz" keys). */
export function levelCrossings(city: Pick<CityState, 'roads' | 'rails'>): string[] {
  const rails = railCells(city)
  return rails.size === 0 ? [] : city.roads.filter((k) => rails.has(k))
}

/** Road-and-rail cells that are not valid level crossings (see `isValidCrossing`). */
export function invalidCrossings(city: Pick<CityState, 'roads' | 'rails'>): string[] {
  const rails = railCells(city)
  if (rails.size === 0) return []
  const roads = new Set(city.roads)
  return city.roads.filter((k) => {
    if (!rails.has(k)) return false
    const { cx, cz } = parseKey(k)
    return !isValidCrossing(roads, rails, cx, cz)
  })
}

/** The city with `rails` as its rail cells (the field dropped when there are none). */
function withRails(city: CityState, rails: Iterable<string>): CityState {
  const list = [...new Set(rails)]
  const { rails: _old, ...rest } = city
  void _old
  return list.length === 0 ? rest : { ...rest, rails: list }
}

/**
 * Rail cells added, silently skipping cells off the grid, under a model or on water (the stroke
 * preview). Level crossings are not checked here: `paintRails` refuses a bad one.
 */
export function addRails(city: CityState, keys: Iterable<string>, sizeOf: SizeOf): CityState {
  const covered = coveredCells(city, sizeOf)
  const water = new Set(city.terrain?.water ?? [])
  const rails = railCells(city)
  for (const key of keys) {
    const { cx, cz } = parseKey(key)
    if (!inGrid(city, cx, cz)) continue
    const k = roadKey(cx, cz)
    if (covered.has(k) || water.has(k)) continue
    rails.add(k)
  }
  return withRails(city, rails)
}

/** A paint result: the new city, or why nothing was painted. */
export interface PaintResult {
  city: CityState | null
  error: PlaceError | null
}

/** Why a stroke on `keys` painted nothing: some cell was water, else they were all taken already. */
function nothingPainted(city: CityState, keys: string[]): PaintResult {
  const water = new Set(city.terrain?.water ?? [])
  return { city: null, error: keys.some((k) => water.has(k)) ? 'water' : 'overlap' }
}

/**
 * Paints road cells (see `addRoads`). Refused as a whole ('crossing') when it would leave a road and
 * a rail meeting anywhere but at a straight level crossing; 'water' / 'overlap' when nothing changed.
 */
export function paintRoads(city: CityState, keys: string[], sizeOf: SizeOf): PaintResult {
  const after = addRoads(city, keys, sizeOf)
  if (after.roads.length === city.roads.length) return nothingPainted(city, keys)
  if (invalidCrossings(after).length > 0) return { city: null, error: 'crossing' }
  return { city: after, error: null }
}

/** Paints rail cells: like `paintRoads`, for rails. */
export function paintRails(city: CityState, keys: string[], sizeOf: SizeOf): PaintResult {
  const after = addRails(city, keys, sizeOf)
  if ((after.rails?.length ?? 0) === (city.rails?.length ?? 0)) return nothingPainted(city, keys)
  if (invalidCrossings(after).length > 0) return { city: null, error: 'crossing' }
  return { city: after, error: null }
}

/**
 * After erasing from `layer`, a crossing next to the erased cells may no longer be a straight: its
 * `layer` cell goes too (repeated until every crossing left is valid).
 */
function dropBrokenCrossings(city: CityState, layer: 'road' | 'rail'): CityState {
  let out = city
  for (let bad = invalidCrossings(out); bad.length > 0; bad = invalidCrossings(out)) {
    const gone = new Set(bad)
    out = layer === 'road' ? { ...out, roads: out.roads.filter((k) => !gone.has(k)) } : withRails(out, (out.rails ?? []).filter((k) => !gone.has(k)))
  }
  return out
}

/**
 * The city without those of `keys` that are roads (plus the road of any crossing that stops being a
 * straight); null when none of them is a road.
 */
export function eraseRoads(city: CityState, keys: Iterable<string>): CityState | null {
  const gone = new Set(keys)
  const roads = city.roads.filter((k) => !gone.has(k))
  if (roads.length === city.roads.length) return null
  return dropBrokenCrossings({ ...city, roads }, 'road')
}

/** Like `eraseRoads`, for rails. */
export function eraseRails(city: CityState, keys: Iterable<string>): CityState | null {
  const gone = new Set(keys)
  const before = city.rails ?? []
  const rails = before.filter((k) => !gone.has(k))
  if (rails.length === before.length) return null
  return dropBrokenCrossings(withRails(city, rails), 'rail')
}

/** The rail network: each rail cell linked to its rail 4-neighbours. */
export const railGraph = (city: Pick<CityState, 'rails'>): CellGraph => cellGraph(city.rails ?? [])

/** The road network: each road cell linked to its road 4-neighbours. */
export const roadGraph = (city: Pick<CityState, 'roads'>): CellGraph => cellGraph(city.roads)

/** One connected piece of railway, for a train: its cells, and its path when it is a simple loop or line. */
export interface RailLine {
  cells: string[]
  /** A simple closed loop (a train circles it). */
  loop: boolean
  /** The cells in path order when the line does not branch (a loop goes round once), else null. */
  path: string[] | null
}

/** The connected rail lines of a city, biggest first. */
export function railLines(city: Pick<CityState, 'rails'>): RailLine[] {
  const graph = railGraph(city)
  return components(graph).map((cells) => ({ cells, loop: isLoop(graph, cells), path: pathOrder(graph, cells) }))
}
