import { createBuilder } from './builder'

const WHITE = 0
const BLUE = 3
const GLASS = 15
const DARK = 8 // dark gray
const SIREN_RED = 16 // trans red
const SIREN_BLUE = 17 // trans blue
const PLATE = 24 // light bluish gray, like the real set's baseplate

const X0 = 4 // station footprint: x 4..27, z 2..13 (the glass doors face -Z)
const X1 = 27
const Z0 = 2
const Z1 = 13
const COURSES = 6

const b = createBuilder()

// Modelled on a real police station set: white and blue walls with glass doors and windows, open at
// the back (towards the camera) like a play set, so the inside stays in view when it is finished.
// Floor first, then everything inside: the jail cell with the robber, the blue front desk with its
// computer, the siren lights on a counter, and the officers.
b.plates(0, X0, Z0, X1, Z1, DARK)

// Jail cell in the front-left corner: bars on two sides, a post against the front wall and a bed.
b.add('bed_2x4', 5, 1, 3, 1, BLUE) // along the front wall, head against the side wall
b.fig('robber', 6, 1, 6, 0) // in the middle of the bars, so he shows between them
b.add('bars_1x4x3', 5, 1, 7, 0, DARK)
b.add('bars_1x4x3', 9, 1, 4, 1, DARK) // its far end closes the corner, so the post is at the back
for (const y of [1, 4, 7]) b.add('round_1x1', 9, y, 3, 0, DARK)
b.fig('police', 11, 1, 4, 0) // keeps an eye on the cell, out of its way

// The blue front desk with a computer and the emergency number, an officer behind it.
for (const x of [14, 16, 18]) b.add('counter_1x2', x, 1, 8, 0, BLUE)
b.add('computer_1x2', 18, 4, 8, 0, WHITE)
b.add('print_number_1x2', 14, 4, 8, 0, WHITE)
b.add('chair_1x1', 17, 1, 6, 0, DARK)
b.fig('police', 15, 1, 6, 0)

// Siren lights on a white counter, with the chief next to them.
for (const x of [22, 24]) b.add('counter_1x2', x, 1, 4, 0, WHITE)
for (const [x, c] of [[22, SIREN_RED], [23, SIREN_BLUE], [24, SIREN_RED], [25, SIREN_BLUE]]) b.add('round_1x1', x, 4, 4, 0, c)
b.fig('police_chief', 20, 1, 6, 0)
const furnished = b.count()

// Walls: white bottom and top courses, blue between. Glass doors and two big windows in front,
// windows in the sides, and no back wall.
const color = (course: number) => (course === 0 || course === COURSES - 1 ? WHITE : BLUE)
b.wall({
  axis: 'x', fixed: Z0, from: X0, to: X1, y: 1, courses: COURSES, color,
  gaps: [{ from: 14, to: 17, c0: 0, c1: 5 }, ...[6, 20].map((from) => ({ from, to: from + 3, c0: 1, c1: 3 }))],
})
b.wall({ axis: 'z', fixed: X0, from: Z0 + 1, to: Z1, y: 1, courses: COURSES, color, gaps: [{ from: 10, to: 11, c0: 2, c1: 3 }] })
b.wall({
  axis: 'z', fixed: X1, from: Z0 + 1, to: Z1, y: 1, courses: COURSES, color,
  gaps: [6, 10].map((from) => ({ from, to: from + 1, c0: 2, c1: 3 })),
})
b.add('door_1x4x6', 14, 1, Z0, 0, GLASS)
for (const x of [6, 20]) b.add('window_1x4x3', x, 4, Z0, 0, GLASS)
b.add('window_1x2x2', X0, 7, 10, 1, GLASS)
for (const z of [6, 10]) b.add('window_1x2x2', X1, 7, z, 1, GLASS)

// A roof over the front, with the police sign, siren lights on its corners and a radio antenna.
b.plates(19, X0, Z0, X1, Z0 + 3, WHITE)
b.add('print_police_2x2', 15, 20, 3, 0, BLUE)
b.add('round_1x1', X0, 20, Z0, 0, SIREN_RED)
b.add('round_1x1', X1, 20, Z0, 0, SIREN_BLUE)
b.add('antenna_1x1', 7, 20, 3, 0, DARK)

// The yard behind, straight on the baseplate: a parking spot with white lines, white fences, a flag
// and a lamp.
b.plates(0, 12, 15, 19, 22, DARK)
for (const x of [12, 19]) b.add('tile_1x2', x, 1, 17, 0, WHITE)
for (const x of [4, 8, 20, 24]) b.add('fence_1x4', x, 0, 21, 0, WHITE)
for (const x of [X0, X1]) b.add('fence_1x4', x, 0, 16, 1, WHITE)
b.add('flag_1x2', 7, 0, 18, 0, BLUE)
b.add('lamp_1x1', 21, 0, 17, 0, 4)

export const policeHq = b.done({
  id: 'police_hq',
  name: { vi: 'Sở cảnh sát', en: 'Police headquarters' },
  difficulty: 3,
  kind: 'building',
  tags: ['police'],
  baseplate: { w: 32, d: 24, c: PLATE },
  openingCount: furnished,
})
