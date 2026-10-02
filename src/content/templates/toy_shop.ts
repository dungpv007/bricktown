import { createBuilder } from './builder'
import { shopFloor, shopShell } from './shop'

const WHITE = 0
const BLACK = 1
const RED = 2
const BLUE = 3
const YELLOW = 4
const GREEN = 5
const LIGHT_GRAY = 7
const DARK_BLUE = 21
const SKY = 23 // medium blue

const b = createBuilder()

// A white floor; shelves of toys along the left wall: balls, a rocket and a teddy-coloured block.
shopFloor(b, WHITE)
for (const z of [5, 9]) b.add('brick_2x4', 2, 1, z, 0, YELLOW)
for (const [z, c] of [[5, RED], [6, BLUE], [9, GREEN], [12, YELLOW]]) b.add('round_1x1', 2, 4, z, 0, c)
b.add('round_1x1', 2, 4, 10, 0, WHITE) // a toy rocket
b.add('cone_1x1', 2, 7, 10, 0, RED)
b.add('brick_1x1', 2, 4, 7, 0, 6)

// The toy robot on the display table, and a kid looking at it.
b.add('table_2x2', 6, 1, 6, 0, WHITE)
b.add('brick_2x2', 6, 4, 6, 0, LIGHT_GRAY)
b.add('print_eyes_1x2', 6, 7, 6, 0, BLACK)
b.fig('kid', 6, 1, 8, 2)

// The till: a counter with a computer and the shopkeeper behind it.
for (const x of [10, 12]) b.add('counter_1x2', x, 1, 8, 0, WHITE)
b.add('computer_1x2', 12, 4, 8, 0, BLACK)
b.fig({ torso: RED, legs: BLUE, face: 'glasses', hat: 'hair_short', hatColor: BLACK, print: 'apron' }, 11, 1, 10, 2)
// Big balls in the back corner.
b.add('round_2x2', 12, 1, 12, 0, GREEN)
b.add('round_2x2', 4, 1, 12, 0, BLUE)
const furnished = b.count()

// Sky blue walls with a yellow top course, a yellow and red awning, a dark blue roof and the TOYS sign.
shopShell(b, {
  wall: (c) => (c >= 5 ? YELLOW : SKY),
  awning: [YELLOW, RED],
  roof: DARK_BLUE,
  door: RED,
  board: ['board_toys_1x6', YELLOW],
})
// A star on the roof.
b.add('print_star_1x1', 2, 23, 12, 0, YELLOW)

export const toyShop = b.done({
  id: 'toy_shop',
  name: { vi: 'Cửa hàng đồ chơi', en: 'Toy shop' },
  difficulty: 3,
  kind: 'building',
  tags: ['shop', 'toys'],
  baseplate: { w: 16, d: 16, c: 24 },
  openingCount: furnished,
  stepSize: 6,
})
