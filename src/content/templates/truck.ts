import { createBuilder } from './builder'

const b = createBuilder()
const BLACK = 1
const CAB = 6 // orange
const BOX = 7 // light gray
const CHASSIS = 8 // dark gray
const GLASS = 15

// Forward is -Z. Four big wheels stick out beside a 4-wide chassis (y = 8).
for (const z of [3, 10]) {
  b.add('wheel_large', 1, 0, z, 0, BLACK)
  b.add('wheel_large', 5, 0, z, 0, BLACK)
}
b.add('plate_4x8', 2, 8, 2, 0, CHASSIS)
b.add('plate_4x4', 2, 8, 10, 0, CHASSIS)

// Cab (y = 9..14): hood, windshield, pillars, roof.
b.add('brick_2x4', 2, 9, 2, 1, CAB)
b.add('window_1x2x2', 2, 9, 4, 0, GLASS)
b.add('window_1x2x2', 4, 9, 4, 0, GLASS)
b.add('brick_1x2', 2, 9, 5, 0, CAB)
b.add('brick_1x2', 5, 9, 5, 0, CAB)
b.add('brick_1x2', 2, 12, 5, 0, CAB)
b.add('brick_1x2', 5, 12, 5, 0, CAB)
b.add('plate_4x4', 2, 15, 3, 0, CAB)

// Cargo box (z 7..13), four courses high (y = 9..20), with a lid.
for (const y of [9, 12, 15, 18]) {
  b.add('brick_2x6', 2, y, 7, 0, BOX)
  b.add('brick_2x6', 4, y, 7, 0, BOX)
  b.add('brick_1x4', 2, y, 13, 1, BOX)
}
b.add('plate_4x8', 2, 21, 6, 0, CAB)

export const truck = b.done({
  id: 'truck',
  name: { vi: 'Xe tải', en: 'Truck' },
  difficulty: 2,
  kind: 'vehicle',
  tags: ['vehicle'],
  baseplate: { w: 8, d: 16 },
})
