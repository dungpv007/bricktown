import { createBuilder } from './builder'

const RED = 2
const WHITE = 0
const ROOF = 8 // dark gray
const FLOOR = 8 // dark gray
const GLASS = 15
const WOOD = 9 // brown

const X0 = 4 // station footprint: x 4..27, z 8..19 (the bay doors face -Z)
const X1 = 27
const Z0 = 8
const Z1 = 19

const b = createBuilder()

// Floor first, then the crew room at the back of the hall.
b.plates(0, X0, Z0, X1, Z1, FLOOR)
for (const x of [5, 7]) b.add('counter_1x2', x, 1, 18, 2, 7)
b.add('fridge_1x1', 10, 1, 18, 2, 0)
b.add('stove_1x2', 12, 1, 18, 2, 8)
b.add('table_2x2', 15, 1, 15, 0, WOOD)
b.add('chair_1x1', 14, 1, 15, 1, 2)
b.add('chair_1x1', 17, 1, 15, 3, 2)
b.add('lamp_1x1', 21, 1, 18, 0, 4)
const furnished = b.count()

// Six courses of red walls with a white top course. Two wide bays (the white course spans them), a side door, small windows.
b.walls({
  x0: X0, x1: X1, z0: Z0, z1: Z1, y: 1, courses: 6, color: (c) => (c === 5 ? WHITE : RED),
  gaps: {
    front: [
      { from: 7, to: 12, c0: 0, c1: 4, lintel: true },
      { from: 15, to: 20, c0: 0, c1: 4, lintel: true },
      { from: 22, to: 25, c0: 0, c1: 5 },
    ],
    back: [8, 18].map((from) => ({ from, to: from + 3, c0: 2, c1: 4 })),
    left: [11, 15].map((from) => ({ from, to: from + 1, c0: 2, c1: 3 })),
    right: [11, 15].map((from) => ({ from, to: from + 1, c0: 2, c1: 3 })),
  },
})
b.add('door_1x4x6', 22, 1, Z0, 0, WOOD)
for (const x of [8, 18]) b.add('window_1x4x3', x, 7, Z1, 0, GLASS)
for (const z of [11, 15]) {
  b.add('window_1x2x2', X0, 7, z, 1, GLASS)
  b.add('window_1x2x2', X1, 7, z, 1, GLASS)
}

// Flat roof, a sign above the side door, and a lookout tower in the back corner (y = 20..34).
b.plates(19, X0, Z0, X1, Z1, ROOF)
b.add('sign_1x2', 23, 20, Z0, 0, WHITE)
for (let course = 0; course < 5; course++) {
  const y = 20 + course * 3
  if (course % 2 === 0) {
    b.add('brick_2x4', 22, y, 16, 0, RED)
    b.add('brick_2x4', 24, y, 16, 0, RED)
  } else {
    b.add('brick_2x4', 22, y, 16, 1, RED)
    b.add('brick_2x4', 22, y, 18, 1, RED)
  }
}
b.add('plate_4x4', 22, 35, 16, 0, WHITE)
b.add('round_2x2', 23, 36, 17, 0, 4)

export const fireStation = b.done({
  id: 'fire_station',
  name: { vi: 'Trạm cứu hỏa', en: 'Fire station' },
  difficulty: 3,
  kind: 'building',
  tags: ['fire_station'],
  baseplate: { w: 32, d: 32 },
  openingCount: furnished,
})
