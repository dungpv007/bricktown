import { createBuilder, type WallGap } from './builder'

const FRAME = 1 // black
const LOBBY = 21 // dark blue
const SLAB = 8 // dark gray
const GLASS = 19 // trans green
const FLOOR = 0
const SILVER = 28
const RED = 2
const GREEN = 5

/** Lower block: x 2..13, z 2..13; it steps back to an upper block of x 4..11, z 4..11. */
const LOW = { x0: 2, x1: 13, z0: 2, z1: 13 }
const HIGH = { x0: 4, x1: 11, z0: 4, z1: 11 }
const LOWER_FLOORS = 3
const UPPER_FLOORS = 5
const FLOOR_PLATES = 10
const FIRST_OFFICE = 20
const TERRACE_Y = FIRST_OFFICE + LOWER_FLOORS * FLOOR_PLATES - 1
const ROOF_Y = TERRACE_Y + UPPER_FLOORS * FLOOR_PLATES

const b = createBuilder()

// Lobby: a reception desk with a computer, the receptionist, a visitor and two plants.
b.plates(0, LOW.x0, LOW.z0, LOW.x1, LOW.z1, FLOOR)
for (const x of [6, 8]) b.add('counter_1x2', x, 1, 9, 0, LOBBY)
b.add('computer_1x2', 8, 4, 9, 0, 1)
b.fig({ torso: 1, legs: 1, face: 'smile', hat: 'hair_long', hatColor: 1, print: 'suit' }, 7, 1, 11, 2)
b.fig('customer2', 7, 1, 6, 0)
for (const x of [3, 11]) b.add('bush_2x2', x, 1, 11, 0, GREEN)
const furnished = b.count()

// Lobby walls: dark blue, a glass door and tall windows.
const lobbyGlass = (spans: number[]): WallGap[] => spans.map((from) => ({ from, to: from + 3, c0: 1, c1: 3 }))
b.walls({
  ...LOW, y: 1, courses: 6, color: LOBBY,
  gaps: {
    front: [{ from: 6, to: 9, c0: 0, c1: 5 }, { from: 3, to: 4, c0: 1, c1: 2 }, { from: 11, to: 12, c0: 1, c1: 2 }],
    back: lobbyGlass([3, 9]),
    left: lobbyGlass([3, 9]),
    right: lobbyGlass([3, 9]),
  },
})
b.add('door_1x4x6', 6, 1, LOW.z0, 0, GLASS)
for (const x of [3, 11]) b.add('window_1x2x2', x, 4, LOW.z0, 0, GLASS)
for (const from of [3, 9]) {
  b.add('window_1x4x3', from, 4, LOW.z1, 0, GLASS)
  b.add('window_1x4x3', LOW.x0, 4, from, 1, GLASS)
  b.add('window_1x4x3', LOW.x1, 4, from, 1, GLASS)
}

/**
 * One office floor of a block: a slab under it, then three courses of glass curtain wall between
 * black piers. `spans` are where the 4-wide windows go along each side.
 */
function officeFloor(box: typeof LOW, y: number, spans: { x: number[]; z: number[] }, withSlab = true) {
  if (withSlab) b.plates(y - 1, box.x0, box.z0, box.x1, box.z1, SLAB)
  const gaps = (list: number[]) => list.map((from) => ({ from, to: from + 3, c0: 0, c1: 2 }))
  b.walls({ ...box, y, courses: 3, color: FRAME, gaps: { front: gaps(spans.x), back: gaps(spans.x), left: gaps(spans.z), right: gaps(spans.z) } })
  for (const from of spans.x) {
    b.add('window_1x4x3', from, y, box.z0, 0, GLASS)
    b.add('window_1x4x3', from, y, box.z1, 0, GLASS)
  }
  for (const from of spans.z) {
    b.add('window_1x4x3', box.x0, y, from, 1, GLASS)
    b.add('window_1x4x3', box.x1, y, from, 1, GLASS)
  }
}

for (let f = 0; f < LOWER_FLOORS; f++) officeFloor(LOW, FIRST_OFFICE + f * FLOOR_PLATES, { x: [3, 9], z: [3, 9] })

// The setback: a terrace with plants on the lower block's roof, then the slimmer upper floors.
b.plates(TERRACE_Y, LOW.x0, LOW.z0, LOW.x1, LOW.z1, SLAB)
for (const [x, z] of [[2, 2], [12, 2], [2, 12], [12, 12]]) b.add('bush_2x2', x, TERRACE_Y + 1, z, 0, GREEN)
for (let f = 0; f < UPPER_FLOORS; f++) {
  const y = TERRACE_Y + 1 + f * FLOOR_PLATES
  // The first upper floor stands right on the terrace slab.
  officeFloor(HIGH, y, { x: [6], z: [6] }, f > 0)
}

// Roof: a slab, two satellite dishes and a silver spire in the middle with a red light on top.
b.plates(ROOF_Y, HIGH.x0, HIGH.z0, HIGH.x1, HIGH.z1, SLAB)
for (const [x, z] of [[4, 4], [10, 10]]) b.add('dish_2x2', x, ROOF_Y + 1, z, 0, SILVER)
b.add('round_2x2', 7, ROOF_Y + 1, 7, 0, SILVER)
for (let i = 0; i < 3; i++) b.add('round_1x1', 7, ROOF_Y + 4 + i * 3, 7, 0, i === 2 ? RED : SILVER)
b.add('antenna_1x1', 7, ROOF_Y + 13, 7, 0, SILVER)

export const officeTower = b.done({
  id: 'office_tower',
  name: { vi: 'Tòa nhà văn phòng', en: 'Office tower' },
  difficulty: 3,
  kind: 'building',
  tags: ['tower', 'office'],
  baseplate: { w: 16, d: 16, c: 24 },
  openingCount: furnished,
  stepSize: 6,
})
