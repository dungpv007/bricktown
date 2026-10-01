import { createBuilder } from './builder'

const PAD = 8 // dark gray
const WHITE = 0
const RED = 2
const YELLOW = 4
const WINDOW = 17 // trans blue
const STEEL = 24 // light bluish gray
const ORANGE = 6

/** The rocket's 2x2 core (studs) and the plate its engine stands on. */
const RX = 7
const RZ = 7
/** Sections of round 2x2 bricks above the engine, from the bottom: colour per section. */
const BODY = [RED, WHITE, WHITE, WHITE, WHITE, RED, WHITE, WHITE, WHITE, WHITE, WINDOW, WHITE]
/** Launch tower: a 2x2 column left of the rocket, and the gantry arm on top of its lower part. */
const TX = 2
const TOWER_BRICKS = 8
const ARM_Y = 1 + TOWER_BRICKS * 3

const b = createBuilder()

// The launch pad, with hazard tiles at its front corners, stars and a flag.
b.plates(0, 2, 2, 13, 13, PAD)
for (const [x, z] of [[2, 12], [12, 12], [12, 2]]) b.add('tile_2x2', x, 1, z, 0, YELLOW)
for (const [x, z] of [[10, 12], [5, 13]]) b.add('print_star_1x1', x, 1, z, 0, WHITE)
b.add('flag_1x2', 2, 1, 2, 0, RED)

// The rocket stands on its engine, four fins around its base (tall edge against the body).
b.add('engine_2x2', RX, 1, RZ, 0, STEEL)
b.add('fin_1x3', RX + 2, 1, RZ + 1, 1, RED) // +X
b.add('fin_1x3', RX - 3, 1, RZ, 3, RED) // -X
b.add('fin_1x3', RX, 1, RZ + 2, 0, RED) // +Z
b.add('fin_1x3', RX + 1, 1, RZ - 3, 2, RED) // -Z
BODY.forEach((c, i) => b.add('round_2x2', RX, 4 + i * 3, RZ, 0, c))
b.add('cone_2x2', RX, 4 + BODY.length * 3, RZ, 0, RED)

// The launch tower (red and white like a mast) with its gantry arm reaching the rocket's window.
for (let i = 0; i < TOWER_BRICKS; i++) b.add('brick_2x2', TX, 1 + i * 3, RZ, 0, i % 2 === 0 ? RED : WHITE)
b.add('plate_1x2', TX, ARM_Y, RZ, 0, STEEL)
b.add('plate_2x4', TX + 1, ARM_Y, RZ, 1, STEEL)
b.fig('astronaut', RX - 2, ARM_Y + 1, RZ + 1, 0)
// The tower goes on above the arm, with a radar dish on top.
for (const y of [ARM_Y + 1, ARM_Y + 4]) b.add('brick_2x2', TX, y, RZ, 0, y === ARM_Y + 1 ? RED : WHITE)
b.add('dish_2x2', TX, ARM_Y + 7, RZ, 0, WHITE)

// Ground equipment: fuel tanks, a control desk with a crew member watching the screen, floodlights.
for (const [y, c] of [[1, ORANGE], [4, WHITE], [7, ORANGE]]) b.add('round_2x2', 10, y, 3, 0, c)
b.add('cone_1x1', 10, 10, 3, 0, WHITE)
for (const z of [6, 8]) b.add('counter_1x2', 12, 1, z, 1, STEEL)
b.add('computer_1x2', 12, 4, 6, 3, WHITE) // screen towards the crew member on its left
b.fig('construction', 11, 1, 6, 1)
for (const [x, z] of [[13, 10], [2, 11]]) b.add('lamp_1x1', x, 1, z, 0, YELLOW)

export const rocket = b.done({
  id: 'rocket',
  name: { vi: 'Tên lửa', en: 'Rocket' },
  difficulty: 3,
  kind: 'prop',
  tags: ['space'],
  baseplate: { w: 16, d: 16, c: 24 },
})
