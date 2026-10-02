import { createBuilder } from './builder'
import { shopFloor, shopShell } from './shop'

const WHITE = 0
const BLACK = 1
const RED = 2
const WOOD = 10 // tan
const STEEL = 8 // dark gray

const b = createBuilder()

// A wooden floor, then the conveyor-belt counter: a U of black counters carrying plates of fish,
// open towards the kitchen at the back.
shopFloor(b, WOOD)
for (const x of [4, 6, 8, 10]) b.add('counter_1x2', x, 1, 8, 0, BLACK)
for (const x of [4, 11]) b.add('counter_1x2', x, 1, 9, 1, BLACK)
for (const [x, z] of [[4, 8], [6, 8], [9, 8], [11, 8], [4, 10], [11, 10]]) b.add('print_fish_1x1', x, 4, z, 0, WHITE)

// The sushi chef inside the U, two customers at the belt (facing it) and one at a little table.
b.fig('sushi_chef', 7, 1, 10, 2)
b.fig('customer', 4, 1, 7, 0)
b.fig('customer2', 10, 1, 7, 0)
b.add('table_2x2', 2, 1, 11, 0, BLACK)
b.add('chair_1x1', 2, 1, 13, 2, RED)
b.fig('kid', 2, 1, 10, 0)

// The kitchen along the back wall: a fridge, a counter and a stove.
b.add('fridge_1x1', 13, 1, 13, 2, WHITE)
b.add('counter_1x2', 9, 1, 13, 2, WHITE)
b.add('stove_1x2', 11, 1, 13, 2, STEEL)
const furnished = b.count()

// White walls with a red top course, a red and white awning, a black roof and the SUSHI sign.
shopShell(b, {
  wall: (c) => (c >= 5 ? RED : WHITE),
  awning: [RED, WHITE],
  roof: BLACK,
  door: RED,
  board: ['board_sushi_1x6', BLACK],
})
// Red lanterns on the roof corners.
for (const [x, z] of [[1, 3], [14, 3]]) {
  b.add('round_1x1', x, 23, z, 0, RED)
  b.add('cone_1x1', x, 26, z, 0, BLACK)
}

export const sushiRestaurant = b.done({
  id: 'sushi_restaurant',
  name: { vi: 'Nhà hàng sushi', en: 'Sushi restaurant' },
  difficulty: 3,
  kind: 'building',
  tags: ['restaurant', 'shop', 'sushi'],
  baseplate: { w: 16, d: 16, c: 24 },
  openingCount: furnished,
  stepSize: 6,
})
