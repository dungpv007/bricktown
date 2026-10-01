import { createBuilder } from './builder'

const STEEL = 24 // light bluish gray
const DARK = 8 // dark gray
const WHITE = 0
const BLUE = 3
const RED = 2
const RED_LIGHT = 16 // trans red
const YELLOW_LIGHT = 18 // trans yellow
const BLUE_LIGHT = 17 // trans blue

// A friendly robot facing +Z (towards the default camera), so the kid sees its face while building.
// Feet and legs, a chunky body with lights in its chest, arms down its sides, and a head with
// printed eyes on a brow ledge and an antenna on top.
const b = createBuilder()

// Feet (pointing forward) and legs with dark knees.
for (const x of [1, 5]) b.add('plate_2x4', x, 0, 2, 0, DARK)
for (const [y, c] of [[1, STEEL], [4, DARK], [7, STEEL]]) {
  for (const x of [1, 5]) b.add('brick_2x2', x, y, 3, 0, c)
}

// Waist: a wide plate that also carries the arms.
b.add('plate_4x8', 0, 10, 2, 1, DARK)

// Body: three courses, the front row white with a row of lights in the middle course.
for (const y of [11, 14, 17]) {
  b.add('brick_2x4', 2, y, 2, 1, STEEL)
  b.add('brick_1x4', 2, y, 4, 1, STEEL)
}
b.add('brick_1x4', 2, 11, 5, 1, WHITE)
for (const [x, c] of [[2, RED_LIGHT], [3, YELLOW_LIGHT], [4, BLUE_LIGHT], [5, RED_LIGHT]]) b.add('round_1x1', x, 14, 5, 0, c)
b.add('brick_1x4', 2, 17, 5, 1, WHITE)

// Chunky arms down the sides, flush with the chest so they show, dark hands at the bottom.
for (const y of [11, 14, 17]) {
  for (const x of [0, 6]) b.add('brick_2x2', x, y, 4, 0, y === 11 ? DARK : BLUE)
}

// Shoulders and neck.
b.add('plate_4x8', 0, 20, 2, 1, DARK)
b.add('brick_2x2', 3, 21, 3, 0, DARK)

// Head: the lower course has a front row that sticks out as a brow ledge carrying the eyes.
b.add('brick_2x4', 2, 24, 2, 1, WHITE)
b.add('brick_1x4', 2, 24, 4, 1, WHITE)
b.add('brick_2x4', 2, 27, 2, 1, WHITE)
b.add('print_eyes_1x2', 3, 27, 4, 0, 1)
for (const x of [2, 5]) b.add('plate_1x1', x, 27, 4, 0, BLUE)
b.add('plate_2x4', 2, 30, 2, 1, BLUE)
b.add('antenna_1x1', 3, 31, 3, 0, RED)

export const robot = b.done({
  id: 'robot',
  name: { vi: 'Rô-bốt', en: 'Robot' },
  difficulty: 2,
  kind: 'prop',
  tags: ['robot'],
  baseplate: { w: 8, d: 8, c: 3 },
})
