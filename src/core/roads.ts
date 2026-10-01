import type { Rot } from './types'

export type RoadTile = 'isolated' | 'end' | 'straight' | 'corner' | 'tee' | 'cross'

export function roadKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

// Connection bitmask: N = -Z, E = +X, S = +Z, W = -X.
const N = 1
const E = 2
const S = 4
const W = 8

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

/** Which tile + rotation to render at (cx, cz), based on its 4 neighbours in `roads`. */
export function roadTileAt(
  roads: Set<string>,
  cx: number,
  cz: number,
): { tile: RoadTile; rot: Rot } {
  let mask = 0
  if (roads.has(roadKey(cx, cz - 1))) mask |= N
  if (roads.has(roadKey(cx + 1, cz))) mask |= E
  if (roads.has(roadKey(cx, cz + 1))) mask |= S
  if (roads.has(roadKey(cx - 1, cz))) mask |= W
  return TILE_BY_MASK[mask]
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
