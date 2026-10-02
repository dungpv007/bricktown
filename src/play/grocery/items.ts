import type { Brick } from '../../core/types'
import { brick } from '../kit'
import type { ItemKind } from './logic'

/**
 * The shop's goods and props, built from catalog bricks (module constants: each bakes once through
 * the shared cache and is shared by every copy). Colours are `COLORS` indices.
 */

const RED = 2
const WHITE = 0
const BLUE = 3
const YELLOW = 4
const GREEN = 5
const ORANGE = 6
const DARK_GRAY = 8
const BROWN = 9
const TAN = 10
const LIME = 11
const GLASS = 15
const TRANS_BLUE = 17
const DARK_TAN = 25
const LIGHT_BLUISH = 24
const SILVER = 28

export const ITEM_BRICKS: Record<ItemKind, Brick[]> = {
  // A red round apple with a little green leaf.
  apple: [brick('round_2x2', RED), brick('plate_1x1', GREEN, 0.5, 3, 0.5), brick('plate_1x1', BROWN, 0.5, 4, 0.5)],
  // A yellow banana with a brown tip.
  banana: [brick('brick_1x3', YELLOW, 0.5, 0, 0), brick('plate_1x1', YELLOW, 0.5, 3, 0), brick('plate_1x1', BROWN, 0.5, 4, 0)],
  // A bottle of water with a white cap.
  water: [brick('round_1x1', TRANS_BLUE), brick('round_1x1', TRANS_BLUE, 0, 3), brick('plate_1x1', BLUE, 0, 2), brick('round_1x1', WHITE, 0, 6)],
  // A golden loaf.
  bread: [brick('brick_2x4', TAN), brick('plate_2x4', DARK_TAN, 0, 3), brick('tile_1x2', TAN, 0.5, 4, 1)],
  // A milk carton: white, a blue band, a slanted top.
  milk: [brick('brick_2x2', WHITE), brick('plate_2x2', BLUE, 0, 3), brick('brick_2x2', WHITE, 0, 4), brick('slope_2x2', WHITE, 0, 7)],
  // A yellow rubber duck with an orange beak.
  duck: [brick('brick_2x2', YELLOW), brick('brick_1x1', YELLOW, 0.5, 3, 0.5), brick('plate_1x1', ORANGE, 0.5, 4, 1.5)],
  // A green watermelon cut open: red inside.
  melon: [brick('brick_2x2', GREEN), brick('plate_2x2', LIME, 0, 3), brick('plate_2x2', RED, 0, 4)],
  // A red toy car facing the kid.
  car: [brick('plate_2x4', DARK_GRAY), brick('brick_2x4', RED, 0, 1), brick('brick_2x2', GLASS, 0, 4, 1), brick('plate_2x2', RED, 0, 7, 1)],
}

/** The emoji used for an item's picture in HTML (price popups). */
export const ITEM_EMOJI: Record<ItemKind, string> = {
  apple: '🍎',
  banana: '🍌',
  water: '💧',
  bread: '🍞',
  milk: '🥛',
  duck: '🦆',
  melon: '🍉',
  car: '🚗',
}

/** The scanner: a dark box with a glass window on top (a laser flashes over it). */
export const SCANNER_BRICKS: Brick[] = [
  brick('plate_4x4', DARK_GRAY),
  brick('plate_1x4', SILVER, 0, 1, 0),
  brick('plate_1x4', SILVER, 3, 1, 0),
  brick('tile_2x2', 16, 1, 1, 1),
]

/** The till: a grey body with a screen. */
export const REGISTER_BRICKS: Brick[] = [
  brick('brick_2x4', LIGHT_BLUISH, 0, 0, 0),
  brick('plate_2x4', DARK_GRAY, 0, 3, 0),
  brick('computer_1x2', LIGHT_BLUISH, 0.5, 4, 1),
]

/** A green shopping basket the scanned goods drop into. */
export const BASKET_BRICKS: Brick[] = [
  brick('plate_4x4', GREEN),
  brick('brick_1x4', GREEN, 0, 1, 0),
  brick('brick_1x4', GREEN, 3, 1, 0),
  brick('brick_1x1', GREEN, 1, 1, 0),
  brick('brick_1x1', GREEN, 2, 1, 0),
  brick('plate_1x1', GREEN, 1, 1, 3),
  brick('plate_1x1', GREEN, 2, 1, 3),
]

/** Shelves of goods behind the shop (decoration on the back wall). */
export const SHELF_BRICKS: Brick[] = (() => {
  const out: Brick[] = []
  const goods = [RED, YELLOW, GREEN, ORANGE, BLUE, WHITE, RED, LIME, YELLOW, ORANGE]
  for (let row = 0; row < 2; row++) {
    const y = row * 6
    for (let x = 0; x < 20; x += 4) out.push(brick('plate_4x4', BROWN, x, y, 0))
    for (let i = 0; i < 8; i++) {
      const c = goods[(i + row * 3) % goods.length]
      const part = (i + row) % 3 === 0 ? 'round_2x2' : 'brick_2x2'
      out.push(brick(part, c, 2 + i * 2, y + 1, 1))
    }
    // Side posts holding the next shelf up.
    if (row < 1) {
      for (const x of [0, 19]) {
        out.push(brick('brick_1x1', BROWN, x, y + 1, 0), brick('plate_1x1', BROWN, x, y + 4, 0), brick('plate_1x1', BROWN, x, y + 5, 0))
      }
    }
  }
  return out
})()
