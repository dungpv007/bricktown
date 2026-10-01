import type { PartCategory, PartDef, PartShape } from '../types'

type Sym = PartDef['sym']

const part = (
  id: string,
  category: PartCategory,
  shape: PartShape,
  w: number,
  d: number,
  h: number,
  studs: boolean,
  sym: Sym,
  tags?: string[],
): PartDef => (tags ? { id, category, shape, w, d, h, studs, sym, tags } : { id, category, shape, w, d, h, studs, sym })

const brick = (w: number, d: number, sym: Sym) =>
  part(`brick_${w}x${d}`, 'brick', 'box', w, d, 3, true, sym)
const plate = (w: number, d: number, sym: Sym) =>
  part(`plate_${w}x${d}`, 'plate', 'box', w, d, 1, true, sym)
const tile = (w: number, d: number, sym: Sym) =>
  part(`tile_${w}x${d}`, 'plate', 'tile', w, d, 1, false, sym)

export const PARTS: PartDef[] = [
  brick(1, 1, 4), brick(1, 2, 2), brick(1, 3, 2), brick(1, 4, 2), brick(1, 6, 2),
  brick(2, 2, 4), brick(2, 3, 2), brick(2, 4, 2), brick(2, 6, 2),

  plate(1, 1, 4), plate(1, 2, 2), plate(1, 4, 2), plate(2, 2, 4),
  plate(2, 4, 2), plate(4, 4, 4), plate(4, 8, 2),
  tile(1, 2, 2), tile(2, 2, 4),

  part('slope_1x2', 'slope', 'slope', 1, 2, 3, true, 1),
  part('slope_2x2', 'slope', 'slope', 2, 2, 3, true, 1),
  part('slope_2x4', 'slope', 'slope', 4, 2, 3, true, 1),
  part('slope_inv_2x2', 'slope', 'slope_inv', 2, 2, 3, true, 1),

  part('round_1x1', 'round', 'cylinder', 1, 1, 3, true, 4),
  part('round_2x2', 'round', 'cylinder', 2, 2, 3, true, 4),
  part('cone_1x1', 'round', 'cone', 1, 1, 3, false, 4),

  part('window_1x2x2', 'door_window', 'window', 2, 1, 6, true, 1),
  part('window_1x4x3', 'door_window', 'window', 4, 1, 9, true, 1),
  part('door_1x4x6', 'door_window', 'door', 4, 1, 18, true, 1),
  part('fence_1x4', 'door_window', 'fence', 4, 1, 3, true, 1),

  part('wheel_small', 'wheel', 'wheel', 1, 2, 5, false, 2, ['wheel']),
  part('wheel_large', 'wheel', 'wheel', 2, 3, 8, false, 2, ['wheel']),

  part('table_2x2', 'furniture', 'table', 2, 2, 3, false, 4),
  part('chair_1x1', 'furniture', 'chair', 1, 1, 3, false, 1),
  part('counter_1x2', 'furniture', 'counter', 2, 1, 3, false, 1),
  part('stove_1x2', 'furniture', 'stove', 2, 1, 3, false, 1),
  part('fridge_1x1', 'furniture', 'fridge', 1, 1, 6, false, 1),
  part('sign_1x2', 'furniture', 'sign', 2, 1, 6, false, 1),
  part('lamp_1x1', 'furniture', 'lamp', 1, 1, 12, false, 4),

  part('tree_2x2', 'nature', 'tree', 2, 2, 12, false, 4),
  part('bush_2x2', 'nature', 'bush', 2, 2, 3, false, 4),
  part('flower_1x1', 'nature', 'flower', 1, 1, 2, false, 4),
]

export const PART_BY_ID: Record<string, PartDef> = Object.fromEntries(
  PARTS.map((p) => [p.id, p]),
)

export function getPart(id: string): PartDef {
  const p = PART_BY_ID[id]
  if (!p) throw new Error(`Unknown part id: ${id}`)
  return p
}

export const PART_CATEGORIES: PartCategory[] = [
  'brick', 'plate', 'slope', 'round', 'door_window', 'wheel', 'furniture', 'nature',
]
