import { createBuilder } from './builder'

const BLUE = 3
const WHITE = 0
const ROOF = 7 // light gray
const FLOOR = 0 // white
const GLASS = 15
const WOOD = 9 // brown

const X0 = 6 // station footprint: x 6..25, z 8..19 (the door faces -Z)
const X1 = 25
const Z0 = 8
const Z1 = 19

const b = createBuilder()

// Floor first, then the front desk, an office table and a little jail cell in the back corner.
b.plates(0, X0, Z0, X1, Z1, FLOOR)
for (const x of [8, 10, 12]) b.add('counter_1x2', x, 1, 12, 0, 7)
b.add('table_2x2', 20, 1, 14, 0, WOOD)
b.add('chair_1x1', 19, 1, 14, 1, 8)
b.add('chair_1x1', 22, 1, 14, 3, 8)
b.add('fence_1x4', 7, 1, 15, 0, 8) // bars across the cell
b.add('fence_1x4', 11, 1, 15, 1, 8) // bars along its side
b.add('lamp_1x1', 24, 1, 18, 0, 4)
const furnished = b.count()

// Six courses of blue walls with a white base and a white top course.
b.walls({
  x0: X0, x1: X1, z0: Z0, z1: Z1, y: 1, courses: 6, color: (c) => (c === 0 || c === 5 ? WHITE : BLUE),
  gaps: {
    front: [{ from: 14, to: 17, c0: 0, c1: 5 }, ...[8, 20].map((from) => ({ from, to: from + 3, c0: 2, c1: 4 }))],
    back: [{ from: 14, to: 17, c0: 2, c1: 4 }],
    left: [11, 15].map((from) => ({ from, to: from + 1, c0: 2, c1: 3 })),
    right: [11, 15].map((from) => ({ from, to: from + 1, c0: 2, c1: 3 })),
  },
})
b.add('door_1x4x6', 14, 1, Z0, 0, WOOD)
for (const x of [8, 20]) b.add('window_1x4x3', x, 7, Z0, 0, GLASS)
b.add('window_1x4x3', 14, 7, Z1, 0, GLASS)
for (const z of [11, 15]) {
  b.add('window_1x2x2', X0, 7, z, 1, GLASS)
  b.add('window_1x2x2', X1, 7, z, 1, GLASS)
}

// Flat roof, a sign above the door, and a red and a blue siren light on the front corners.
b.plates(19, X0, Z0, X1, Z1, ROOF)
b.add('sign_1x2', 15, 20, Z0, 0, BLUE)
b.add('round_1x1', X0, 20, Z0, 0, 2)
b.add('round_1x1', X1, 20, Z0, 0, BLUE)

export const policeStation = b.done({
  id: 'police_station',
  name: { vi: 'Đồn cảnh sát', en: 'Police station' },
  difficulty: 3,
  kind: 'building',
  tags: ['police'],
  baseplate: { w: 32, d: 32 },
  openingCount: furnished,
})
