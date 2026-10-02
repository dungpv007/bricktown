import { createBuilder } from './builder'

const b = createBuilder()
const SAND = 10 // tan
const RED = 2
const BLUE = 3
const YELLOW = 4
const STEEL = 7 // light gray
const SEAT = 6 // orange

// Soft sand under everything.
b.plates(0, 0, 0, 7, 7, SAND)

// The slide: a red tower (x 0..1, z 0..1) with a yellow deck on top, and a blue slide stepping
// down towards +Z on yellow supports.
for (const y of [1, 4, 7]) b.add('brick_2x2', 0, y, 0, 0, RED)
b.add('plate_2x2', 0, 10, 0, 0, YELLOW)
for (const y of [1, 4]) b.add('brick_2x2', 0, y, 2, 0, YELLOW)
b.add('brick_2x2', 0, 1, 4, 0, YELLOW)
b.add('slope_2x2', 0, 7, 2, 0, BLUE)
b.add('slope_2x2', 0, 4, 4, 0, BLUE)
b.add('slope_2x2', 0, 1, 6, 0, BLUE)

// The swing: two posts with a bar across the top, and a seat between them.
for (const x of [3, 6]) {
  for (const y of [1, 4, 7]) b.add('brick_1x1', x, y, 3, 0, STEEL)
}
b.add('plate_1x4', 3, 10, 3, 1, RED)
b.add('brick_1x2', 4, 1, 3, 1, STEEL)
b.add('tile_1x2', 4, 4, 3, 1, SEAT)

// Kids: one at the bottom of the slide, one behind the swing seat, about to push it.
b.fig('kid', 2, 1, 6, 0)
b.fig({ torso: 2, legs: 3, face: 'smile', hat: 'cap', hatColor: 3, print: 'plain' }, 4, 1, 1, 0)

export const playground = b.done({
  id: 'playground',
  name: { vi: 'Sân chơi', en: 'Playground' },
  difficulty: 2,
  kind: 'prop',
  tags: ['park'],
  baseplate: { w: 8, d: 8 },
})
