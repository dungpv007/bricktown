import { createBuilder } from './builder'

const b = createBuilder()
const BLACK = 1
const RED = 2
const WHITE = 0
const CHASSIS = 8 // dark gray
const LADDER = 7 // light gray
const GLASS = 15

// Forward is -Z. Six small wheels on three axles under a 4-wide chassis (y = 5).
for (const z of [3, 8, 11]) {
  b.add('wheel_small', 2, 0, z, 0, BLACK)
  b.add('wheel_small', 5, 0, z, 0, BLACK)
}
b.add('plate_4x8', 2, 5, 2, 0, CHASSIS)
b.add('plate_4x4', 2, 5, 10, 0, CHASSIS)

// Cab (y = 6..11): hood, windshield, two pillars and a back wall.
b.add('brick_2x4', 2, 6, 2, 1, RED)
b.add('window_1x2x2', 2, 6, 4, 0, GLASS)
b.add('window_1x2x2', 4, 6, 4, 0, GLASS)
b.add('brick_1x2', 2, 6, 5, 0, RED)
b.add('brick_1x2', 5, 6, 5, 0, RED)
b.add('brick_1x2', 2, 9, 5, 0, RED)
b.add('brick_1x2', 5, 9, 5, 0, RED)
b.add('plate_4x4', 2, 12, 3, 0, WHITE)
b.add('round_1x1', 2, 13, 5, 0, RED)
b.add('round_1x1', 5, 13, 5, 0, RED)

// Equipment body behind the cab (z 7..13), three courses high (y = 6..14), with a white roof.
for (const y of [6, 9, 12]) {
  b.add('brick_2x6', 2, y, 7, 0, RED)
  b.add('brick_2x6', 4, y, 7, 0, RED)
  b.add('brick_1x4', 2, y, 13, 1, RED)
}
b.add('plate_4x8', 2, 15, 6, 0, WHITE)

// A ladder along the roof: two rails with three rungs between them.
for (const x of [2, 5]) {
  b.add('plate_1x4', x, 16, 7, 0, LADDER)
  b.add('plate_1x4', x, 16, 11, 0, LADDER)
}
for (const z of [8, 10, 12]) b.add('plate_1x2', 3, 16, z, 1, LADDER)

export const fireTruck = b.done({
  id: 'fire_truck',
  name: { vi: 'Xe cứu hỏa', en: 'Fire truck' },
  difficulty: 3,
  kind: 'vehicle',
  tags: ['fire'],
  baseplate: { w: 8, d: 16 },
})
