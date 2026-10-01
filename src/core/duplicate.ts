import { canPlace, type PlaceError } from './model'
import { getPart } from './parts/catalog'
import { footprint } from './rotation'
import type { Baseplate, Brick } from './types'

export type Spot = { x: number; y: number; z: number }

/**
 * Where a copy of `brick` goes: directly on top of it, else beside it (+X, -X, +Z, -Z, one
 * rotated footprint away, same height), else on top of those spots. The first spot that
 * `canPlace` accepts wins; when none does, the error of the first (on top) is reported.
 */
export function duplicateSpot(bricks: Brick[], brick: Brick, baseplate: Baseplate): { spot: Spot } | { error: PlaceError } {
  const part = getPart(brick.p)
  const { fx, fz } = footprint(part, brick.r)
  const { x, y, z } = brick
  const top = y + part.h
  const beside: Array<[number, number]> = [[x + fx, z], [x - fx, z], [x, z + fz], [x, z - fz]]
  const spots: Spot[] = [
    { x, y: top, z },
    ...beside.map(([sx, sz]) => ({ x: sx, y, z: sz })),
    ...beside.map(([sx, sz]) => ({ x: sx, y: top, z: sz })),
  ]
  let first: PlaceError | null = null
  for (const spot of spots) {
    const error = canPlace(bricks, { ...brick, id: '__copy__', ...spot }, baseplate)
    if (!error) return { spot }
    first ??= error
  }
  return { error: first ?? 'collision' }
}
