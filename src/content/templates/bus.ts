import { createBuilder } from './builder'

const b = createBuilder()
const BLACK = 1
const RED = 2
const WHITE = 0
const CHASSIS = 8 // dark gray
const GLASS = 15
const LIGHT = 18 // trans yellow

// Forward is -Z. A 6-wide city bus (x 1..6, z 0..15): two axles under a long chassis.
for (const z of [3, 11]) {
  b.add('wheel_small', 1, 0, z, 0, BLACK)
  b.add('wheel_small', 6, 0, z, 0, BLACK)
}
// Each chassis plate rests on a wheel.
for (const z of [0, 8]) b.add('plate_4x8', 1, 5, z, 0, CHASSIS)
for (const z of [0, 4, 8, 12]) b.add('plate_2x4', 5, 5, z, 0, CHASSIS)

// The driver at the wheel and two passengers, before the body closes round them.
b.add('steering_1x2', 2, 6, 1, 0, BLACK)
b.fig({ torso: 21, legs: 1, face: 'smile', hat: 'cap', hatColor: 21, print: 'plain' }, 2, 6, 2, 2)
b.fig('customer', 4, 6, 7, 3)
b.fig('kid', 3, 6, 11, 1)

// Two red courses round the bottom, with headlights in front.
for (const y of [6, 9]) {
  b.add('brick_1x6', 1, y, 0, 0, RED)
  b.add('brick_1x6', 1, y, 6, 0, RED)
  b.add('brick_1x4', 1, y, 12, 0, RED)
  b.add('brick_1x6', 6, y, 0, 0, RED)
  b.add('brick_1x6', 6, y, 6, 0, RED)
  b.add('brick_1x4', 6, y, 12, 0, RED)
  b.add('brick_1x4', 2, y, 15, 1, RED)
  if (y === 6) {
    b.add('brick_1x4', 2, y, 0, 1, RED)
  } else {
    b.add('brick_1x1', 2, y, 0, 0, LIGHT)
    b.add('brick_1x2', 3, y, 0, 1, RED)
    b.add('brick_1x1', 5, y, 0, 0, LIGHT)
  }
}

// A band of windows all round: the big windscreen, seven windows each side, two at the back.
b.add('window_1x2x2', 2, 12, 0, 0, GLASS)
b.add('window_1x2x2', 4, 12, 0, 0, GLASS)
b.add('window_1x2x2', 2, 12, 15, 0, GLASS)
b.add('window_1x2x2', 4, 12, 15, 0, GLASS)
for (const x of [1, 6]) {
  b.add('brick_1x1', x, 12, 0, 0, WHITE)
  b.add('brick_1x1', x, 15, 0, 0, WHITE)
  b.add('brick_1x1', x, 12, 15, 0, WHITE)
  b.add('brick_1x1', x, 15, 15, 0, WHITE)
  for (let z = 1; z < 15; z += 2) b.add('window_1x2x2', x, 12, z, 1, GLASS)
}

// A white roof.
for (const z of [0, 8]) b.add('plate_4x8', 1, 18, z, 0, WHITE)
for (const z of [0, 4, 8, 12]) b.add('plate_2x4', 5, 18, z, 0, WHITE)

export const bus = b.done({
  id: 'bus',
  name: { vi: 'Xe buýt', en: 'Bus' },
  difficulty: 2,
  kind: 'vehicle',
  tags: ['vehicle', 'bus'],
  baseplate: { w: 8, d: 16 },
})
