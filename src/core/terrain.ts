import { coveredCells, inGrid, type SourceSize } from './city'
import { parseKey } from './cellGraph'
import { roadKey } from './roads'
import type { CityPlacement, CityState, CityTerrain } from './types'

/**
 * City terrain: painted ground cells (water, pavement, sand); every other cell is grass. Rules:
 * - no road or rail on water (and no water under one);
 * - an ordinary model never covers water, a `water` model (bridge, island, boat) always covers some;
 * - pavement and sand take anything.
 */

export type TerrainKind = keyof CityTerrain
/** What a terrain brush paints; grass is the default ground, so painting it erases. */
export type TerrainBrush = TerrainKind | 'grass'

export const TERRAIN_KINDS: readonly TerrainKind[] = ['water', 'pavement', 'sand']
export const TERRAIN_BRUSHES: readonly TerrainBrush[] = ['water', 'pavement', 'sand', 'grass']

type SizeOf = (source: string) => SourceSize

/** Ground kind by "cx,cz" key, grass cells left out. */
export function terrainMap(city: Pick<CityState, 'terrain'>): Map<string, TerrainKind> {
  const map = new Map<string, TerrainKind>()
  const t = city.terrain
  if (!t) return map
  for (const kind of TERRAIN_KINDS) for (const key of t[kind]) if (!map.has(key)) map.set(key, kind)
  return map
}

/** A fast ground lookup for one city state: `(cx, cz) => 'water' | 'pavement' | 'sand' | 'grass'`. */
export function terrainLookup(city: Pick<CityState, 'terrain'>): (cx: number, cz: number) => TerrainBrush {
  const map = terrainMap(city)
  return (cx, cz) => map.get(roadKey(cx, cz)) ?? 'grass'
}

/** The ground at one cell (build a `terrainLookup` to ask about many). */
export function terrainAt(city: Pick<CityState, 'terrain'>, cx: number, cz: number): TerrainBrush {
  const key = roadKey(cx, cz)
  const t = city.terrain
  if (!t) return 'grass'
  for (const kind of TERRAIN_KINDS) if (t[kind].includes(key)) return kind
  return 'grass'
}

/** The water cells of a city. */
export const waterCells = (city: Pick<CityState, 'terrain'>): Set<string> => new Set(city.terrain?.water ?? [])

/** The city with `map` as its terrain (the field dropped when everything is grass). */
function withTerrain(city: CityState, map: Map<string, TerrainKind>): CityState {
  const { terrain: _old, ...rest } = city
  void _old
  if (map.size === 0) return rest
  const terrain: CityTerrain = { water: [], pavement: [], sand: [] }
  for (const [key, kind] of map) terrain[kind].push(key)
  return { ...rest, terrain }
}

/**
 * The city with `brush` painted on `keys`, skipping cells it may not go: off the grid; water under a
 * road, a rail or an ordinary model; and taking away the last water cell under a water model. Null
 * when nothing changed.
 */
export function paintTerrain(city: CityState, keys: Iterable<string>, brush: TerrainBrush, sizeOf: SizeOf): CityState | null {
  const map = terrainMap(city)
  const blocked = new Set<string>() // where water may not go
  if (brush === 'water') {
    for (const k of city.roads) blocked.add(k)
    for (const k of city.rails ?? []) blocked.add(k)
    for (const k of coveredCells(city, sizeOf, (p) => sizeOf(p.source).water !== true)) blocked.add(k)
  }
  // Water models: how many water cells each still has, and which models cover each cell.
  const wetCount = new Map<CityPlacement, number>()
  const modelsAt = new Map<string, CityPlacement[]>()
  if (brush !== 'water') {
    for (const p of city.placements) {
      if (sizeOf(p.source).water !== true) continue
      let wet = 0
      for (const k of coveredCells({ ...city, placements: [p] }, sizeOf)) {
        if (map.get(k) === 'water') wet++
        let list = modelsAt.get(k)
        if (!list) modelsAt.set(k, (list = []))
        list.push(p)
      }
      wetCount.set(p, wet)
    }
  }
  let changed = false
  for (const key of keys) {
    const { cx, cz } = parseKey(key)
    if (!inGrid(city, cx, cz)) continue
    const k = roadKey(cx, cz) // canonical spelling
    const was = map.get(k) ?? 'grass'
    if (was === brush) continue
    if (brush === 'water') {
      if (blocked.has(k)) continue
    } else if (was === 'water') {
      const models = modelsAt.get(k) ?? []
      if (models.some((p) => (wetCount.get(p) ?? 0) <= 1)) continue // a bridge would end up on dry land
      for (const p of models) wetCount.set(p, (wetCount.get(p) ?? 0) - 1)
    }
    if (brush === 'grass') map.delete(k)
    else map.set(k, brush)
    changed = true
  }
  return changed ? withTerrain(city, map) : null
}

/** Unique valid "cx,cz" keys (integers inside a `size` grid, canonical spelling) from a stored list. */
export function normalizeCellKeys(v: unknown, size: number): string[] {
  if (!Array.isArray(v)) return []
  const out = new Set<string>()
  for (const k of v) {
    if (typeof k !== 'string') continue
    const { cx, cz } = parseKey(k)
    if (inGrid({ size }, cx, cz)) out.add(roadKey(cx, cz))
  }
  return [...out]
}

/**
 * Stored terrain made safe: valid keys only, each cell in one list (water first, then pavement,
 * sand), no water under `blocked` cells (roads and rails). Undefined when nothing is left.
 */
export function normalizeTerrain(v: unknown, size: number, blocked: Set<string>): CityTerrain | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  const raw = v as Record<string, unknown>
  const seen = new Set<string>()
  const out: CityTerrain = { water: [], pavement: [], sand: [] }
  for (const kind of TERRAIN_KINDS) {
    for (const k of normalizeCellKeys(raw[kind], size)) {
      if (seen.has(k) || (kind === 'water' && blocked.has(k))) continue
      seen.add(k)
      out[kind].push(k)
    }
  }
  return seen.size === 0 ? undefined : out
}

/** A row of consecutive cells: z row `cz`, cells `cx0` up to (not including) `cx1`. */
export interface CellRun {
  cz: number
  cx0: number
  cx1: number
}

/** `keys` grouped into horizontal runs (row by row, left to right): one box each instead of one per cell. */
export function cellRuns(keys: Iterable<string>): CellRun[] {
  const cells = [...new Set(keys)].map(parseKey).sort((a, b) => a.cz - b.cz || a.cx - b.cx)
  const runs: CellRun[] = []
  for (const { cx, cz } of cells) {
    const last = runs[runs.length - 1]
    if (last && last.cz === cz && last.cx1 === cx) last.cx1 = cx + 1
    else runs.push({ cz, cx0: cx, cx1: cx + 1 })
  }
  return runs
}
