import type { Rot } from './types'

export type RoadTile = 'isolated' | 'end' | 'straight' | 'corner' | 'tee' | 'cross'

export function roadKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

// Connection bitmask: N = -Z, E = +X, S = +Z, W = -X.
export const N = 1
export const E = 2
export const S = 4
export const W = 8

/** The four directions as (bit, dx, dz), in mask order N, E, S, W. */
export const DIRS: ReadonlyArray<{ bit: number; dx: number; dz: number }> = [
  { bit: N, dx: 0, dz: -1 },
  { bit: E, dx: 1, dz: 0 },
  { bit: S, dx: 0, dz: 1 },
  { bit: W, dx: -1, dz: 0 },
]

/** Which of the 4 neighbours of (cx, cz) are in `cells` (a N | E | S | W mask). */
export function neighbourMask(cells: Set<string>, cx: number, cz: number): number {
  let mask = 0
  for (const d of DIRS) if (cells.has(roadKey(cx + d.dx, cz + d.dz))) mask |= d.bit
  return mask
}

/** Rotate a connection mask 90 degrees counter-clockwise (viewed from above): N->W, W->S, S->E, E->N. */
function rotateMask(mask: number): number {
  let out = 0
  if (mask & N) out |= W
  if (mask & W) out |= S
  if (mask & S) out |= E
  if (mask & E) out |= N
  return out
}

/** Base (rot 0) connection masks of the rotatable tiles. */
const BASE_MASKS: Array<[Exclude<RoadTile, 'isolated' | 'cross'>, number]> = [
  ['end', N],
  ['straight', N | S],
  ['corner', N | E],
  ['tee', N | E | S],
]

/** Pick tile + rot for every possible neighbour mask (indexed 0..15). */
const TILE_BY_MASK: Array<{ tile: RoadTile; rot: Rot }> = (() => {
  const table: Array<{ tile: RoadTile; rot: Rot }> = new Array(16)
  table[0] = { tile: 'isolated', rot: 0 }
  table[N | E | S | W] = { tile: 'cross', rot: 0 }
  for (const [tile, base] of BASE_MASKS) {
    let mask = base
    for (const rot of [0, 1, 2, 3] as const) {
      // keep the lowest rot for symmetric tiles (straight)
      table[mask] ??= { tile, rot }
      mask = rotateMask(mask)
    }
  }
  return table
})()

/** Tile + rotation for a neighbour mask (see `neighbourMask`). A straight is rot 0 along Z (N-S), rot 1 along X. */
export function tileForMask(mask: number): { tile: RoadTile; rot: Rot } {
  return TILE_BY_MASK[mask & 15]
}

/**
 * Which tile + rotation to render at (cx, cz), based on its 4 neighbours in `roads`. Works for any
 * auto-tiled cell layer: rails use it with the rail cells.
 */
export function roadTileAt(
  roads: Set<string>,
  cx: number,
  cz: number,
): { tile: RoadTile; rot: Rot } {
  return TILE_BY_MASK[neighbourMask(roads, cx, cz)]
}

/**
 * Paint an L-shaped road (first along X, then along Z) from `from` to `to`.
 * Returns the existing roads plus the new path, deduplicated.
 */
export function paintRoadLine(
  roads: string[],
  from: { cx: number; cz: number },
  to: { cx: number; cz: number },
): string[] {
  const out = new Set(roads)
  const dx = Math.sign(to.cx - from.cx)
  const dz = Math.sign(to.cz - from.cz)
  let { cx, cz } = from
  out.add(roadKey(cx, cz))
  while (cx !== to.cx) {
    cx += dx
    out.add(roadKey(cx, cz))
  }
  while (cz !== to.cz) {
    cz += dz
    out.add(roadKey(cx, cz))
  }
  return [...out]
}
