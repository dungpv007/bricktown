import { createBuilder } from './builder'
import { trainBase } from './train'

const b = createBuilder()
const BLACK = 1
const RED = 2
const GOLD = 29
const GLASS = 15

// Forward is -Z. A steam engine, 6 wide (x 1..6) and 16 long, on eight wheels and a red frame.
trainBase(b, RED)

// The driver stands in the cab at the back (before the cab walls close round him).
b.fig({ torso: 21, legs: 21, face: 'beard', hat: 'cap', hatColor: 21, print: 'vest' }, 3, 6, 12, 2)

// Cowcatcher at the front: slopes falling forward.
b.add('slope_1x2', 1, 6, 0, 2, RED)
b.add('slope_2x4', 2, 6, 0, 2, BLACK)
b.add('slope_1x2', 6, 6, 0, 2, RED)

// The boiler (x 2..5, z 2..9): three courses, black with a red band, then the chimney and a gold dome.
for (const y of [6, 9, 12]) {
  for (const [x, z] of [[2, 2], [4, 2], [2, 6], [4, 6]]) b.add('brick_2x4', x, y, z, 0, y === 9 ? RED : BLACK)
}
b.add('round_2x2', 3, 15, 2, 0, BLACK)
b.add('round_2x2', 3, 18, 2, 0, BLACK)
b.add('dish_2x2', 3, 15, 6, 0, GOLD)
// Lamps on the front of the boiler.
for (const x of [2, 5]) b.add('round_1x1', x, 15, 2, 0, 18)

// The cab (x 1..6, z 10..15): a red course, windows all round between corner posts, another red
// course and a black roof.
b.add('brick_1x6', 1, 6, 10, 1, RED)
b.add('brick_1x6', 1, 6, 15, 1, RED)
for (const x of [1, 6]) b.add('brick_1x4', x, 6, 11, 0, RED)
for (const [x, z] of [[1, 10], [6, 10], [1, 15], [6, 15]]) {
  b.add('brick_1x1', x, 9, z, 0, RED)
  b.add('brick_1x1', x, 12, z, 0, RED)
}
for (const z of [10, 15]) for (const x of [2, 4]) b.add('window_1x2x2', x, 9, z, 0, GLASS)
for (const x of [1, 6]) for (const z of [11, 13]) b.add('window_1x2x2', x, 9, z, 1, GLASS)
b.add('brick_1x6', 1, 15, 10, 1, RED)
b.add('brick_1x6', 1, 15, 15, 1, RED)
for (const x of [1, 6]) b.add('brick_1x4', x, 15, 11, 0, RED)
b.plates(18, 1, 10, 6, 15, BLACK)

export const trainEngine = b.done({
  id: 'train_engine',
  name: { vi: 'Đầu tàu hỏa', en: 'Train engine' },
  difficulty: 3,
  kind: 'vehicle',
  tags: ['train'],
  baseplate: { w: 8, d: 16 },
})
