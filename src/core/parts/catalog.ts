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
/** A flat tile with a print on top, its long side along X (prints read along +X). */
const printed = (name: string, print: string, w: number, d: number): PartDef => ({
  ...part(`print_${name}_${d}x${w}`, 'decor', 'tile_print', w, d, 1, false, 1),
  print,
})
/**
 * A sign board: an upright 1-stud-thin box, `w` studs wide and `h` plates tall, with its print on
 * both big faces (front and back, see printGeometry), so a shop sign reads from the street and
 * from behind.
 */
const board = (name: string, print: string, w: number, h: number): PartDef => ({
  ...part(`board_${name}_1x${w}`, 'decor', 'box', w, 1, h, false, 1),
  print,
})

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
  part('cone_2x2', 'round', 'nose_cone', 2, 2, 6, false, 4),
  part('dish_2x2', 'round', 'dish', 2, 2, 2, false, 4),
  part('engine_2x2', 'round', 'engine', 2, 2, 3, false, 4),
  part('fin_1x3', 'slope', 'fin', 1, 3, 6, false, 1),

  part('window_1x2x2', 'door_window', 'window', 2, 1, 6, true, 1),
  part('window_1x4x3', 'door_window', 'window', 4, 1, 9, true, 1),
  part('door_1x4x6', 'door_window', 'door', 4, 1, 18, true, 1),
  part('fence_1x4', 'door_window', 'fence', 4, 1, 3, true, 1),
  part('bars_1x4x3', 'door_window', 'bars', 4, 1, 9, true, 2),

  part('wheel_small', 'wheel', 'wheel', 1, 2, 5, false, 2, ['wheel']),
  part('wheel_large', 'wheel', 'wheel', 2, 3, 8, false, 2, ['wheel']),

  part('table_2x2', 'furniture', 'table', 2, 2, 3, false, 4),
  part('chair_1x1', 'furniture', 'chair', 1, 1, 3, false, 1),
  part('counter_1x2', 'furniture', 'counter', 2, 1, 3, false, 1),
  part('stove_1x2', 'furniture', 'stove', 2, 1, 3, false, 1),
  part('fridge_1x1', 'furniture', 'fridge', 1, 1, 6, false, 1),
  part('sign_1x2', 'furniture', 'sign', 2, 1, 6, false, 1),
  part('lamp_1x1', 'furniture', 'lamp', 1, 1, 12, false, 4),
  part('steering_1x2', 'furniture', 'steering', 2, 1, 3, false, 1),
  { ...part('computer_1x2', 'furniture', 'computer', 2, 1, 4, false, 1), print: 'screen' },
  part('bed_2x4', 'furniture', 'bed', 2, 4, 3, false, 1),

  part('tree_2x2', 'nature', 'tree', 2, 2, 12, false, 4),
  part('bush_2x2', 'nature', 'bush', 2, 2, 3, false, 4),
  part('flower_1x1', 'nature', 'flower', 1, 1, 2, false, 4),

  part('flag_1x2', 'decor', 'flag', 2, 1, 9, false, 1),
  part('antenna_1x1', 'decor', 'antenna', 1, 1, 6, false, 4),
  printed('police', 'police', 2, 2),
  printed('fire', 'fire', 2, 2),
  printed('clock', 'clock', 2, 2),
  printed('stop', 'stop', 2, 2),
  printed('arrow', 'arrow', 2, 2),
  printed('menu', 'menu', 2, 1),
  printed('screen', 'screen', 2, 1),
  printed('eyes', 'robot_eyes', 2, 1),
  printed('number', 'number_112', 2, 1),
  printed('heart', 'heart', 1, 1),
  printed('star', 'star', 1, 1),
  printed('fish', 'fish', 1, 1),
  // Shop items (play/unlocks): the shop signs as flat tiles, locked in the palette until bought.
  printed('sushi', 'sushi', 2, 1),
  printed('bakery', 'bakery', 2, 1),
  printed('grocery', 'grocery', 2, 1),
  board('sushi', 'sushi', 6, 9),
  board('bakery', 'bakery', 6, 9),
  board('toys', 'toys', 6, 9),
  board('grocery', 'grocery', 6, 9),
  board('taxi', 'taxi', 2, 3),

  // A minifigure: its look comes from `Brick.fig` (see core/figures), not the brick colour.
  part('minifig', 'figure', 'minifig', 2, 1, 12, false, 1),
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
  'brick', 'plate', 'slope', 'round', 'door_window', 'wheel', 'furniture', 'nature', 'decor', 'figure',
]
