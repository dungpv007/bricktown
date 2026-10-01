import { createBuilder } from './builder'

const WALL = 7 // light gray
const TRIM = 4 // yellow cornice
const ROOF = 8 // dark gray
const FLOOR = 8 // dark gray
const GLASS = 15

const X0 = 6 // garage footprint: x 6..25, z 8..23 (the wide opening faces -Z)
const X1 = 25
const Z0 = 8
const Z1 = 23

const b = createBuilder()

// Floor first, then the workshop corner and spare tyres.
b.plates(0, X0, Z0, X1, Z1, FLOOR)
for (const x of [8, 10]) b.add('counter_1x2', x, 1, 22, 2, 9)
b.add('lamp_1x1', 7, 1, 22, 0, 4)
b.add('lamp_1x1', 24, 1, 22, 0, 4)
for (const x of [21, 23]) b.add('wheel_large', x, 1, 19, 0, 1)
b.add('fridge_1x1', 12, 1, 22, 2, 0)
const furnished = b.count()

// Five courses of walls (y = 1..15). The opening is 10 wide and 4 courses tall; the top course spans it as a beam.
b.walls({
  x0: X0, x1: X1, z0: Z0, z1: Z1, y: 1, courses: 5, color: (c) => (c === 4 ? TRIM : WALL),
  gaps: {
    front: [{ from: 11, to: 20, c0: 0, c1: 3, lintel: true }],
    back: [{ from: 14, to: 17, c0: 2, c1: 4 }],
    left: [11, 19].map((from) => ({ from, to: from + 1, c0: 2, c1: 3 })),
    right: [11, 19].map((from) => ({ from, to: from + 1, c0: 2, c1: 3 })),
  },
})
b.add('window_1x4x3', 14, 7, Z1, 0, GLASS)
for (const z of [11, 19]) {
  b.add('window_1x2x2', X0, 7, z, 1, GLASS)
  b.add('window_1x2x2', X1, 7, z, 1, GLASS)
}

// Flat roof with a sign above the opening.
b.plates(16, X0, Z0, X1, Z1, ROOF)
b.add('sign_1x2', 15, 17, Z0, 0, 4)

export const garage = b.done({
  id: 'garage',
  name: { vi: 'Nhà để xe', en: 'Garage' },
  difficulty: 3,
  kind: 'building',
  tags: ['garage'],
  baseplate: { w: 32, d: 32 },
  openingCount: furnished,
})
