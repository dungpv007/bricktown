import { createBuilder } from './builder'

const WALL = 4 // yellow
const ROOF = 9 // brown
const FLOOR = 10 // tan
const WOOD = 9 // brown
const GLASS = 15

const X0 = 4 // house footprint: x 4..11, z 4..11
const X1 = 11
const Z0 = 4
const Z1 = 11
const UPPER = 19 // the upstairs floor plates sit on top of the six ground-floor courses

const b = createBuilder()

// Ground floor: floor plates and furniture first.
b.plates(0, X0, Z0, X1, Z1, FLOOR)
b.add('fridge_1x1', 5, 1, 10, 2, 0)
b.add('counter_1x2', 6, 1, 10, 0, 7)
b.add('stove_1x2', 8, 1, 10, 0, 8)
b.add('table_2x2', 6, 1, 6, 0, WOOD)
b.add('chair_1x1', 5, 1, 6, 1, 2)
b.add('chair_1x1', 8, 1, 6, 3, 2)
const furnished = b.count()

// Ground-floor walls (y = 1..18).
b.walls({
  x0: X0, x1: X1, z0: Z0, z1: Z1, y: 1, courses: 6, color: WALL,
  gaps: {
    front: [{ from: 5, to: 8, c0: 0, c1: 5 }, { from: 9, to: 10, c0: 2, c1: 3 }],
    back: [{ from: 5, to: 8, c0: 2, c1: 4 }],
    left: [{ from: 7, to: 8, c0: 2, c1: 3 }],
    right: [{ from: 7, to: 8, c0: 2, c1: 3 }],
  },
})
b.add('door_1x4x6', 5, 1, Z0, 0, WOOD)
b.add('window_1x2x2', 9, 7, Z0, 0, GLASS)
b.add('window_1x4x3', 5, 7, Z1, 0, GLASS)
b.add('window_1x2x2', X0, 7, 7, 1, GLASS)
b.add('window_1x2x2', X1, 7, 7, 1, GLASS)

// Upstairs: floor plates, a cosy corner, then four more courses (y = 20..31).
b.plates(UPPER, X0, Z0, X1, Z1, FLOOR)
b.add('table_2x2', 7, UPPER + 1, 7, 0, WOOD)
b.add('chair_1x1', 6, UPPER + 1, 7, 1, 2)
b.add('chair_1x1', 9, UPPER + 1, 7, 3, 2)
b.add('lamp_1x1', 5, UPPER + 1, 9, 0, 4)
b.walls({
  x0: X0, x1: X1, z0: Z0, z1: Z1, y: UPPER + 1, courses: 4, color: WALL,
  gaps: {
    front: [{ from: 5, to: 6, c0: 1, c1: 2 }, { from: 9, to: 10, c0: 1, c1: 2 }],
    back: [{ from: 5, to: 8, c0: 1, c1: 3 }],
    left: [{ from: 7, to: 8, c0: 1, c1: 2 }],
    right: [{ from: 7, to: 8, c0: 1, c1: 2 }],
  },
})
b.add('window_1x2x2', 5, UPPER + 4, Z0, 0, GLASS)
b.add('window_1x2x2', 9, UPPER + 4, Z0, 0, GLASS)
b.add('window_1x4x3', 5, UPPER + 4, Z1, 0, GLASS)
b.add('window_1x2x2', X0, UPPER + 4, 7, 1, GLASS)
b.add('window_1x2x2', X1, UPPER + 4, 7, 1, GLASS)

b.gableRoof(UPPER + 13, X0, X1, Z0, ROOF)

export const houseTall = b.done({
  id: 'house_tall',
  name: { vi: 'Nhà hai tầng', en: 'Two-storey house' },
  difficulty: 3,
  kind: 'building',
  tags: ['house'],
  baseplate: { w: 16, d: 16 },
  openingCount: furnished,
})
