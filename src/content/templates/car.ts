import { createBuilder } from './builder'

const b = createBuilder()
const BLACK = 1
const RED = 2
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

// Body (y = 6): hood, windshield, pillars, rear window, trunk.
b.add('brick_2x4', 2, 6, 3, 1, RED)
b.add('window_1x2x2', 2, 6, 5, 0, GLASS)
b.add('window_1x2x2', 4, 6, 5, 0, GLASS)
b.add('brick_1x2', 2, 6, 6, 0, RED)
b.add('brick_1x2', 5, 6, 6, 0, RED)
b.add('window_1x2x2', 2, 6, 8, 0, GLASS)
b.add('window_1x2x2', 4, 6, 8, 0, GLASS)
b.add('brick_2x4', 2, 6, 9, 1, RED)
b.add('brick_1x2', 2, 9, 6, 0, RED)
b.add('brick_1x2', 5, 9, 6, 0, RED)

// Roof (y = 12).
b.add('plate_4x4', 2, 12, 5, 0, RED)

export const car = b.done({
  id: 'car',
  name: { vi: 'Xe hơi', en: 'Car' },
  difficulty: 2,
  kind: 'vehicle',
  tags: ['vehicle'],
  baseplate: { w: 8, d: 16 },
})
