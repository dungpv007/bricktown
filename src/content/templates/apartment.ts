import { createBuilder } from './builder'

const WALL = 10 // tan
const BASE = 22 // dark red
const SLAB = 0 // white
const RAIL = 0
const ROOF = 8 // dark gray
const FLOOR = 24
const GLASS = 15
const WOOD = 9
const TANK = 7

const X0 = 2 // apartment footprint: x 2..13, z 4..11 (the door faces -Z)
const X1 = 13
const Z0 = 4
const Z1 = 11
/** The ground floor is six courses (the door's height); every upper floor is three, then a slab. */
const UPPER_FLOORS = 5
const FIRST_UPPER = 20
const FLOOR_PLATES = 10
const ROOF_Y = FIRST_UPPER + UPPER_FLOORS * FLOOR_PLATES - 1

const b = createBuilder()

/**
 * A floor slab at `y` with a two-stud balcony along the front (z 2..3) and the back (z 12..13).
 * Every plate rests on a wall: strips across the front and back walls, and a long plate from the
 * left wall to the middle (the slab has nothing under its centre).
 */
function slab(y: number) {
  for (const z of [2, 10]) for (const x of [2, 6, 10]) b.add('plate_4x4', x, y, z, 0, SLAB)
  b.add('plate_4x8', 2, y, 6, 1, SLAB)
  b.add('plate_4x4', 10, y, 6, 0, SLAB)
}

// The entrance hall: floor, a lamp, a plant, the letterbox counter and a neighbour coming home.
b.plates(0, X0, Z0, X1, Z1, FLOOR)
b.add('lamp_1x1', 3, 1, 10, 0, 4)
b.add('bush_2x2', 11, 1, 9, 0, 5)
b.add('counter_1x2', 3, 1, 5, 1, WOOD)
b.fig('customer2', 8, 1, 8, 0)
const furnished = b.count()

// Ground floor: dark red brick, the front door and windows all round.
b.walls({
  x0: X0, x1: X1, z0: Z0, z1: Z1, y: 1, courses: 6, color: BASE,
  gaps: {
    front: [{ from: 6, to: 9, c0: 0, c1: 5 }, { from: 3, to: 4, c0: 2, c1: 3 }, { from: 11, to: 12, c0: 2, c1: 3 }],
    back: [{ from: 3, to: 6, c0: 1, c1: 3 }, { from: 9, to: 12, c0: 1, c1: 3 }],
    left: [{ from: 6, to: 9, c0: 1, c1: 3 }],
    right: [{ from: 6, to: 9, c0: 1, c1: 3 }],
  },
})
b.add('door_1x4x6', 6, 1, Z0, 0, WOOD)
for (const x of [3, 11]) b.add('window_1x2x2', x, 7, Z0, 0, GLASS)
for (const x of [3, 9]) b.add('window_1x4x3', x, 4, Z1, 0, GLASS)
for (const x of [X0, X1]) b.add('window_1x4x3', x, 4, 6, 1, GLASS)

// Five flats, one per floor: a balcony slab with railings (and flowers), then walls with two big
// windows front and back and a small one each side.
for (let f = 0; f < UPPER_FLOORS; f++) {
  const y = FIRST_UPPER + f * FLOOR_PLATES
  slab(y - 1)
  for (const x of [2, 6, 10]) {
    b.add('fence_1x4', x, y, 2, 0, RAIL)
    b.add('fence_1x4', x, y, 13, 0, RAIL)
  }
  if (f < UPPER_FLOORS - 1) for (const x of f % 2 === 0 ? [3, 12] : [7]) b.add('flower_1x1', x, y, 12, 0, f % 2 === 0 ? 2 : 12)
  const big = [{ from: 3, to: 6, c0: 0, c1: 2 }, { from: 9, to: 12, c0: 0, c1: 2 }]
  const small = [{ from: 7, to: 8, c0: 1, c1: 2 }]
  b.walls({ x0: X0, x1: X1, z0: Z0, z1: Z1, y, courses: 3, color: WALL, gaps: { front: big, back: big, left: small, right: small } })
  for (const x of [3, 9]) {
    b.add('window_1x4x3', x, y, Z0, 0, GLASS)
    b.add('window_1x4x3', x, y, Z1, 0, GLASS)
  }
  for (const x of [X0, X1]) b.add('window_1x2x2', x, y + 3, 7, 1, GLASS)
}

// The top floor's neighbours are out on the back balcony (nothing above them).
const top = FIRST_UPPER + (UPPER_FLOORS - 1) * FLOOR_PLATES
b.fig('kid', 4, top, 12, 0)
b.fig('customer', 9, top, 12, 0)

// Flat roof with a railing, a water tank and an aerial.
b.plates(ROOF_Y, X0, Z0, X1, Z1, ROOF)
for (const x of [2, 6, 10]) {
  b.add('fence_1x4', x, ROOF_Y + 1, Z0, 0, RAIL)
  b.add('fence_1x4', x, ROOF_Y + 1, Z1, 0, RAIL)
}
for (const y of [ROOF_Y + 1, ROOF_Y + 4]) b.add('round_2x2', 4, y, 7, 0, TANK)
b.add('dish_2x2', 4, ROOF_Y + 7, 7, 0, TANK)
b.add('antenna_1x1', 11, ROOF_Y + 1, 8, 0, 28)

export const apartment = b.done({
  id: 'apartment',
  name: { vi: 'Chung cư', en: 'Apartment block' },
  difficulty: 3,
  kind: 'building',
  tags: ['house', 'tower', 'apartment'],
  baseplate: { w: 16, d: 16, c: 24 },
  openingCount: furnished,
  stepSize: 6,
})
