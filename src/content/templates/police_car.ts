import { createBuilder } from './builder'

const b = createBuilder()
const BLACK = 1
const RED = 2
const BLUE = 3
const WHITE = 0
const CHASSIS = 8 // dark gray
const GLASS = 15

// Forward is -Z. Four wheels under the corners of a 4-wide chassis.
b.add('wheel_small', 2, 0, 4, 0, BLACK)
b.add('wheel_small', 5, 0, 4, 0, BLACK)
b.add('wheel_small', 2, 0, 10, 0, BLACK)
b.add('wheel_small', 5, 0, 10, 0, BLACK)

// Chassis plates on top of the wheels (y = 5).
b.add('plate_4x8', 2, 5, 3, 0, CHASSIS)
b.add('plate_2x4', 2, 5, 11, 1, CHASSIS)

// Body (y = 6): white hood and trunk, blue pillars, glass all round.
b.add('brick_2x4', 2, 6, 3, 1, WHITE)
b.add('window_1x2x2', 2, 6, 5, 0, GLASS)
b.add('window_1x2x2', 4, 6, 5, 0, GLASS)
b.add('brick_1x2', 2, 6, 6, 0, BLUE)
b.add('brick_1x2', 5, 6, 6, 0, BLUE)
b.add('window_1x2x2', 2, 6, 8, 0, GLASS)
b.add('window_1x2x2', 4, 6, 8, 0, GLASS)
b.add('brick_2x4', 2, 6, 9, 1, WHITE)
b.add('brick_1x2', 2, 9, 6, 0, BLUE)
b.add('brick_1x2', 5, 9, 6, 0, BLUE)

// Blue roof (y = 12) with a red and blue light bar on top.
b.add('plate_4x4', 2, 12, 5, 0, BLUE)
for (const x of [2, 3]) b.add('round_1x1', x, 13, 6, 0, RED)
for (const x of [4, 5]) b.add('round_1x1', x, 13, 6, 0, BLUE)

export const policeCar = b.done({
  id: 'police_car',
  name: { vi: 'Xe cảnh sát', en: 'Police car' },
  difficulty: 2,
  kind: 'vehicle',
  tags: ['police'],
  baseplate: { w: 8, d: 16 },
})
