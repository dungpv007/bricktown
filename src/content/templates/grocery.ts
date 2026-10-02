import { createBuilder } from './builder'
import { shopFloor, shopShell } from './shop'

const WHITE = 0
const BLACK = 1
const RED = 2
const YELLOW = 4
const GREEN = 5
const ORANGE = 6
const DARK_GRAY = 8
const CRATE = 9 // brown
const LIME = 11
const FLOOR = 24 // light bluish gray

const b = createBuilder()

/** A wooden crate (2x2) with two pieces of fruit on top, standing at `y` (the shop floor by default). */
const crate = (x: number, z: number, fruit: number, y = 1) => {
  b.add('brick_2x2', x, y, z, 0, CRATE)
  b.add('round_1x1', x, y + 3, z, 0, fruit)
  b.add('round_1x1', x + 1, y + 3, z + 1, 0, fruit)
}

// Fruit and vegetable crates along both side walls.
shopFloor(b, FLOOR)
crate(2, 5, RED)
crate(2, 8, ORANGE)
crate(2, 11, LIME)
crate(12, 5, YELLOW)
crate(12, 8, GREEN)

// The till by the back wall with the grocer, and a customer shopping.
for (const x of [7, 9]) b.add('counter_1x2', x, 1, 11, 0, WHITE)
b.add('computer_1x2', 9, 4, 11, 0, BLACK)
b.fig({ torso: GREEN, legs: BLACK, face: 'beard', hat: 'cap', hatColor: GREEN, print: 'apron' }, 8, 1, 12, 2)
b.fig('customer2', 6, 1, 7, 3)
// Crates out on the sidewalk, under the awning.
crate(1, 0, RED, 0)
crate(13, 0, ORANGE, 0)
const furnished = b.count()

// White walls with a green top course, a green and white awning, a dark roof and the GROCERY sign.
shopShell(b, {
  wall: (c) => (c >= 5 ? GREEN : WHITE),
  awning: [GREEN, WHITE],
  roof: DARK_GRAY,
  door: GREEN,
  board: ['board_grocery_1x6', GREEN],
})

export const grocery = b.done({
  id: 'grocery',
  name: { vi: 'Cửa hàng tạp hóa', en: 'Grocery' },
  difficulty: 3,
  kind: 'building',
  tags: ['shop', 'grocery'],
  baseplate: { w: 16, d: 16, c: 24 },
  openingCount: furnished,
  stepSize: 6,
})
