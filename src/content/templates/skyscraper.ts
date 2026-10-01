import { createBuilder, type WallGap } from './builder'

const LOBBY = 8 // dark gray stone
const COLUMN = 0 // white
const SLAB = 24 // light bluish gray
const GLASS = 17 // trans blue
const FLOOR = 0 // white
const ROOF = 8
const RED = 2
const SILVER = 28

const X0 = 3 // tower footprint: x 3..12, z 3..12 (the door faces -Z)
const X1 = 12
const Z0 = 3
const Z1 = 12
const LOBBY_COURSES = 6
const OFFICE_FLOORS = 7
/** Each office floor: three courses of glass between white corner columns, then a floor slab. */
const FLOOR_PLATES = 10
const FIRST_OFFICE = 1 + LOBBY_COURSES * 3 + 1
const ROOF_Y = FIRST_OFFICE + OFFICE_FLOORS * FLOOR_PLATES
/** Window spans (4 wide) on every side of the tower. */
const SPANS = [4, 8]

const b = createBuilder()

// Lobby floor, a reception desk with a computer, the receptionist and a visitor, a plant and a lamp.
b.plates(0, X0, Z0, X1, Z1, FLOOR)
// The desk runs front to back, so the receptionist behind it faces the camera side (+X).
for (const z of [6, 8]) b.add('counter_1x2', 8, 1, z, 1, LOBBY)
b.add('computer_1x2', 8, 4, 7, 3, 1)
b.fig({ torso: 1, legs: 1, face: 'glasses', hat: 'hair_short', hatColor: 9, print: 'suit' }, 7, 1, 7, 1)
b.fig('customer', 10, 1, 7, 3)
b.add('bush_2x2', 10, 1, 10, 0, 5)
b.add('lamp_1x1', 4, 1, 11, 0, 4)
const furnished = b.count()

// Lobby: two storeys of dark stone with a glass door and tall windows.
const lobbyWindows = (c0: number): WallGap[] => SPANS.map((from) => ({ from, to: from + 3, c0, c1: c0 + 2 }))
b.walls({
  x0: X0, x1: X1, z0: Z0, z1: Z1, y: 1, courses: LOBBY_COURSES, color: LOBBY,
  gaps: {
    front: [{ from: 6, to: 9, c0: 0, c1: 5 }, { from: 4, to: 5, c0: 1, c1: 2 }, { from: 10, to: 11, c0: 1, c1: 2 }],
    back: lobbyWindows(1),
    left: lobbyWindows(1),
    right: lobbyWindows(1),
  },
})
b.add('door_1x4x6', 6, 1, Z0, 0, GLASS)
for (const x of [4, 10]) b.add('window_1x2x2', x, 4, Z0, 0, GLASS)
for (const from of SPANS) {
  b.add('window_1x4x3', from, 4, Z1, 0, GLASS)
  b.add('window_1x4x3', X0, 4, from, 1, GLASS)
  b.add('window_1x4x3', X1, 4, from, 1, GLASS)
}

// Seven office floors: a slab, then glass all round between the corner columns.
for (let f = 0; f <= OFFICE_FLOORS; f++) {
  const y = FIRST_OFFICE + f * FLOOR_PLATES
  b.plates(y - 1, X0, Z0, X1, Z1, f === OFFICE_FLOORS ? ROOF : SLAB)
  if (f === OFFICE_FLOORS) break
  const glass = SPANS.map((from) => ({ from, to: from + 3, c0: 0, c1: 2 }))
  b.walls({ x0: X0, x1: X1, z0: Z0, z1: Z1, y, courses: 3, color: COLUMN, gaps: { front: glass, back: glass, left: glass, right: glass } })
  for (const from of SPANS) {
    b.add('window_1x4x3', from, y, Z0, 0, GLASS)
    b.add('window_1x4x3', from, y, Z1, 0, GLASS)
    b.add('window_1x4x3', X0, y, from, 1, GLASS)
    b.add('window_1x4x3', X1, y, from, 1, GLASS)
  }
}

// Rooftop: a machine room, a dish, a tall antenna mast and a flag on the corner.
b.walls({ x0: 5, x1: 10, z0: 5, z1: 10, y: ROOF_Y, courses: 2, color: ROOF })
b.plates(ROOF_Y + 6, 5, 5, 10, 10, SLAB)
b.add('dish_2x2', 10, ROOF_Y, 11, 0, COLUMN)
b.add('flag_1x2', X0, ROOF_Y, Z0, 0, RED)
for (let i = 0; i < 4; i++) b.add('round_1x1', 7, ROOF_Y + 7 + i * 3, 7, 0, i === 3 ? RED : SILVER)
b.add('antenna_1x1', 7, ROOF_Y + 19, 7, 0, SILVER)

export const skyscraper = b.done({
  id: 'skyscraper',
  name: { vi: 'Tòa nhà chọc trời', en: 'Skyscraper' },
  difficulty: 3,
  kind: 'building',
  tags: ['tower'],
  baseplate: { w: 16, d: 16, c: 24 },
  openingCount: furnished,
  stepSize: 6,
})
