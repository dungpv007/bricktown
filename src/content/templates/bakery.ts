import { createBuilder } from './builder'
import { shopFloor, shopShell } from './shop'

const WHITE = 0
const RED = 2
const BROWN = 9
const CREAM = 10 // tan
const PINK = 12
const CRUST = 25 // dark tan
const GOLDEN = 6 // orange
const STEEL = 8

const b = createBuilder()

// A white floor, the bread counter with rolls and loaves on it, and the baker behind it.
shopFloor(b, WHITE)
for (const x of [5, 7, 9]) b.add('counter_1x2', x, 1, 8, 0, WHITE)
for (const [x, c] of [[5, CRUST], [6, GOLDEN], [9, CRUST], [10, GOLDEN]]) b.add('round_1x1', x, 4, 8, 0, c)
b.add('plate_1x2', 7, 4, 8, 1, GOLDEN) // a long loaf
b.fig({ torso: WHITE, legs: CREAM, face: 'grin', hat: 'chef', print: 'chef' }, 7, 1, 10, 2)
b.fig('customer', 7, 1, 6, 0)

// A café table with a pink cake (and its cherry) by the window.
b.add('table_2x2', 2, 1, 5, 0, BROWN)
b.add('round_2x2', 2, 4, 5, 0, PINK)
b.add('flower_1x1', 2, 7, 5, 0, RED)
b.add('chair_1x1', 4, 1, 5, 3, RED)

// Ovens and a bread rack along the back wall.
for (const x of [2, 4]) b.add('stove_1x2', x, 1, 13, 2, STEEL)
for (const x of [10, 12]) b.add('counter_1x2', x, 1, 13, 2, BROWN)
for (const x of [10, 12, 13]) b.add('round_1x1', x, 4, 13, 0, GOLDEN)
const furnished = b.count()

// Cream walls with a brown top course, a pink and white awning, a brown roof and the BAKERY sign.
shopShell(b, {
  wall: (c) => (c >= 5 ? BROWN : CREAM),
  awning: [PINK, WHITE],
  roof: BROWN,
  door: BROWN,
  board: ['board_bakery_1x6', BROWN],
})

export const bakery = b.done({
  id: 'bakery',
  name: { vi: 'Tiệm bánh', en: 'Bakery' },
  difficulty: 3,
  kind: 'building',
  tags: ['shop', 'bakery'],
  baseplate: { w: 16, d: 16, c: 24 },
  openingCount: furnished,
  stepSize: 6,
})
