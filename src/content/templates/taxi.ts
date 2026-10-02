import { createBuilder } from './builder'

const b = createBuilder()
const BLACK = 1
const YELLOW = 4
const CHASSIS = 8 // dark gray
const GLASS = 15

// Forward is -Z. The car's shape in taxi yellow, with a black stripe and the TAXI sign on the roof.
for (const [x, z] of [[2, 4], [5, 4], [2, 10], [5, 10]]) b.add('wheel_small', x, 0, z, 0, BLACK)

// Chassis plates on top of the wheels (y = 5).
b.add('plate_4x8', 2, 5, 3, 0, CHASSIS)
b.add('plate_2x4', 2, 5, 11, 1, CHASSIS)

// Body (y = 6): hood, windshield, pillars, rear window, trunk.
b.add('brick_2x4', 2, 6, 3, 1, YELLOW)
b.add('window_1x2x2', 2, 6, 5, 0, GLASS)
b.add('window_1x2x2', 4, 6, 5, 0, GLASS)
b.add('brick_1x2', 2, 6, 6, 0, YELLOW)
b.add('brick_1x2', 5, 6, 6, 0, YELLOW)
b.add('window_1x2x2', 2, 6, 8, 0, GLASS)
b.add('window_1x2x2', 4, 6, 8, 0, GLASS)
b.add('brick_2x4', 2, 6, 9, 1, YELLOW)
b.add('brick_1x2', 2, 9, 6, 0, BLACK)
b.add('brick_1x2', 5, 9, 6, 0, BLACK)
// Black stripes on the hood and the trunk.
b.add('plate_2x2', 3, 9, 3, 0, BLACK)
b.add('plate_1x4', 2, 9, 10, 1, BLACK)

// Roof (y = 12) and the lit TAXI sign across it.
b.add('plate_4x4', 2, 12, 5, 0, YELLOW)
b.add('board_taxi_1x2', 3, 13, 6, 0, YELLOW)

export const taxi = b.done({
  id: 'taxi',
  name: { vi: 'Xe taxi', en: 'Taxi' },
  difficulty: 2,
  kind: 'vehicle',
  tags: ['vehicle', 'taxi'],
  baseplate: { w: 8, d: 16 },
})
