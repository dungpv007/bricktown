import { createBuilder } from './builder'

const WALL = 4 // yellow
const ROOF = 2 // red
const FLOOR = 10 // tan
const WOOD = 9 // brown
const GLASS = 15

const X0 = 4 // restaurant footprint: x 4..27, z 8..23 (the door faces -Z)
const X1 = 27
const Z0 = 8
const Z1 = 23

const b = createBuilder()

// Floor first, then everything that goes inside, so kids see the dining room before the walls go up.
b.plates(0, X0, Z0, X1, Z1, FLOOR)

// Three tables with two chairs each on both sides of the entrance (left tables, then mirrored right
// tables). At the left middle table a customer stands where its left chair would be.
const tables: Array<[number, number]> = [[7, 11], [7, 15], [11, 13], [23, 11], [23, 15], [19, 13]]
for (const [x, z] of tables) {
  b.add('table_2x2', x, 1, z, 0, WOOD)
  if (x !== 11) b.add('chair_1x1', x - 1, 1, z, 1, 2) // backs away from the table
  b.add('chair_1x1', x + 2, 1, z, 3, 2)
}
b.fig('customer', 10, 1, 13, 1) // facing the table on its right

// A service counter with a gap to walk through, and the kitchen along the back wall with the chef
// at the stoves.
for (const x of [11, 13, 17, 19]) b.add('counter_1x2', x, 1, 18, 0, 7)
for (const x of [12, 13]) b.add('fridge_1x1', x, 1, 22, 2, 0)
for (const x of [15, 17]) b.add('stove_1x2', x, 1, 22, 2, 8)
b.fig('chef', 15, 1, 21, 0)
const furnished = b.count()

// Six courses of walls (y = 1..18): a door in the middle, big windows either side of it.
b.walls({
  x0: X0, x1: X1, z0: Z0, z1: Z1, y: 1, courses: 6, color: WALL,
  gaps: {
    front: [
      { from: 14, to: 17, c0: 0, c1: 5 },
      ...[5, 9, 19, 23].map((from) => ({ from, to: from + 3, c0: 2, c1: 4 })),
    ],
    // A door out to the terrace, a big kitchen window (the chef can be seen at work) and a small window.
    back: [{ from: 19, to: 22, c0: 0, c1: 5 }, { from: 14, to: 17, c0: 2, c1: 4 }, { from: 8, to: 9, c0: 2, c1: 3 }],
    left: [10, 18].map((from) => ({ from, to: from + 3, c0: 2, c1: 4 })),
    right: [10, 18].map((from) => ({ from, to: from + 3, c0: 2, c1: 4 })),
  },
})
b.add('door_1x4x6', 14, 1, Z0, 0, WOOD)
for (const x of [5, 9, 19, 23]) b.add('window_1x4x3', x, 7, Z0, 0, GLASS)
b.add('door_1x4x6', 19, 1, Z1, 0, WOOD)
b.add('window_1x4x3', 14, 7, Z1, 0, GLASS)
b.add('window_1x2x2', 8, 7, Z1, 0, GLASS)
for (const z of [10, 18]) {
  b.add('window_1x4x3', X0, 7, z, 1, GLASS)
  b.add('window_1x4x3', X1, 7, z, 1, GLASS)
}

// A flat roof with a sign above the entrance.
b.plates(19, X0, Z0, X1, Z1, ROOF)
b.add('sign_1x2', 15, 20, Z0, 0, 0)

// The terrace out the back door: two tables with customers, the waiter coming out, the menu board on
// its stand and flowers.
b.plates(0, 8, 24, 25, 29, FLOOR)
for (const [x, fig] of [[10, 'customer2'], [15, 'kid']] as const) {
  b.add('table_2x2', x, 1, 25, 0, WOOD)
  b.fig(fig, x - 1, 1, 25, 1) // facing the table
  b.add('chair_1x1', x + 2, 1, 25, 3, 2)
}
b.fig('waiter', 19, 1, 26, 0)
b.add('brick_1x2', 23, 1, 25, 1, WOOD)
b.add('print_menu_1x2', 23, 4, 25, 0, 1)
for (const x of [8, 24]) b.add('bush_2x2', x, 1, 28, 0, 5)
for (const x of [11, 13, 15, 17]) b.add('flower_1x1', x, 1, 29, 0, x % 4 === 1 ? 2 : 12)

export const restaurant = b.done({
  id: 'restaurant',
  name: { vi: 'Nhà hàng', en: 'Restaurant' },
  difficulty: 3,
  kind: 'building',
  tags: ['restaurant'],
  baseplate: { w: 32, d: 32 },
  openingCount: furnished,
})
