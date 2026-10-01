import { createBuilder } from './builder'

const WALL = 3 // blue
const ROOF = 8 // dark gray
const FLOOR = 10 // tan
const WOOD = 9 // brown
const GLASS = 15

const X0 = 2 // house footprint: x 2..13, z 4..11
const X1 = 13
const Z0 = 4
const Z1 = 11

const b = createBuilder()

// First the floor and the furniture, so kids can see the inside before the walls go up.
b.plates(0, X0, Z0, X1, Z1, FLOOR)
b.add('fridge_1x1', 3, 1, 10, 2, 0)
b.add('counter_1x2', 4, 1, 10, 0, 7)
b.add('stove_1x2', 6, 1, 10, 0, 8)
b.add('table_2x2', 8, 1, 6, 0, WOOD)
b.add('chair_1x1', 7, 1, 6, 1, 2)
b.add('chair_1x1', 10, 1, 6, 3, 2)
const furnished = b.count()

// Six courses of walls (y = 1..18) with the door and windows left open.
b.walls({
  x0: X0, x1: X1, z0: Z0, z1: Z1, y: 1, courses: 6, color: WALL,
  gaps: {
    front: [{ from: 6, to: 9, c0: 0, c1: 5 }, { from: 3, to: 4, c0: 2, c1: 3 }, { from: 11, to: 12, c0: 2, c1: 3 }],
    back: [{ from: 4, to: 7, c0: 2, c1: 4 }, { from: 10, to: 11, c0: 2, c1: 3 }],
    left: [{ from: 7, to: 8, c0: 2, c1: 3 }],
    right: [{ from: 7, to: 8, c0: 2, c1: 3 }],
  },
})
b.add('door_1x4x6', 6, 1, Z0, 0, WOOD)
b.add('window_1x2x2', 3, 7, Z0, 0, GLASS)
b.add('window_1x2x2', 11, 7, Z0, 0, GLASS)
b.add('window_1x4x3', 4, 7, Z1, 0, GLASS)
b.add('window_1x2x2', 10, 7, Z1, 0, GLASS)
b.add('window_1x2x2', X0, 7, 7, 1, GLASS)
b.add('window_1x2x2', X1, 7, 7, 1, GLASS)

b.gableRoof(19, X0, X1, Z0, ROOF)

export const houseBlue = b.done({
  id: 'house_blue',
  name: { vi: 'Nhà xanh', en: 'Blue house' },
  difficulty: 2,
  kind: 'building',
  tags: ['house'],
  baseplate: { w: 16, d: 16 },
  openingCount: furnished,
})
