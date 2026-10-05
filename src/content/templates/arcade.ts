import { createBuilder } from './builder'
import { SHOP_ROOF_Y, shopFloor, shopShell } from './shop'

const WHITE = 0
const BLACK = 1
const RED = 2
const BLUE = 3
const YELLOW = 4
const PINK = 12
const PURPLE = 13
const AZURE = 14
const GLASS = 15
const TRANS_RED = 16
const TRANS_BLUE = 17
const TRANS_YELLOW = 18
const TRANS_GREEN = 19
const DARK_BLUE = 21
const LAVENDER = 27

const b = createBuilder()

/** A claw machine: a coloured base, a glass box with a prize inside, a yellow top and a light. */
const clawMachine = (x: number, z: number, base: number, prize: number, light: number) => {
  b.add('brick_2x2', x, 1, z, 0, base)
  b.add('brick_2x2', x, 4, z, 0, GLASS)
  b.add('brick_2x2', x, 7, z, 0, GLASS)
  b.add('plate_2x2', x, 10, z, 0, YELLOW)
  b.add('round_1x1', x, 11, z, 0, light)
  b.add('round_1x1', x + 1, 11, z + 1, 0, prize)
}

/** A video game cabinet: a dark body and a glowing screen on top. */
const gameCabinet = (x: number, z: number, body: number) => {
  b.add('brick_2x2', x, 1, z, 0, body)
  b.add('brick_2x2', x, 4, z, 0, body)
  b.add('computer_1x2', x, 7, z, 0, BLACK)
}

// A lavender floor; two claw machines along the left wall, game cabinets along the right one.
shopFloor(b, LAVENDER)
clawMachine(2, 5, RED, PINK, TRANS_RED)
clawMachine(2, 10, BLUE, AZURE, TRANS_YELLOW)
gameCabinet(12, 5, DARK_BLUE)
gameCabinet(12, 10, PURPLE)

// The prize counter at the back with the attendant, and a kid trying the claw machine.
for (const x of [7, 9]) b.add('counter_1x2', x, 1, 12, 0, WHITE)
b.add('round_1x1', 7, 4, 12, 0, PINK)
b.add('round_1x1', 10, 4, 12, 0, YELLOW)
b.fig({ torso: PURPLE, legs: BLACK, face: 'grin', hat: 'cap', hatColor: PURPLE, print: 'apron' }, 8, 1, 13, 2)
b.fig('kid', 5, 1, 6, 3)
const furnished = b.count()

// Purple walls with a yellow top course, a purple and yellow awning, a dark blue roof.
shopShell(b, {
  wall: (c) => (c >= 5 ? YELLOW : PURPLE),
  awning: [PURPLE, YELLOW],
  roof: DARK_BLUE,
  door: YELLOW,
})
// On the roof: a two-course sign with stars along the top, and blinking lights at the corners.
const R = SHOP_ROOF_Y + 1
b.add('brick_1x6', 5, R, 4, 1, RED)
b.add('brick_1x6', 5, R + 3, 4, 1, YELLOW)
for (const x of [5, 7, 8, 10]) b.add('print_star_1x1', x, R + 6, 4, 0, YELLOW)
for (const [x, z, c] of [[1, 3, TRANS_RED], [14, 3, TRANS_BLUE], [1, 14, TRANS_GREEN], [14, 14, TRANS_YELLOW]]) b.add('round_1x1', x, R, z, 0, c)

export const arcade = b.done({
  id: 'arcade',
  name: { vi: 'Khu trò chơi', en: 'Arcade' },
  difficulty: 3,
  kind: 'building',
  tags: ['shop', 'arcade'],
  baseplate: { w: 16, d: 16, c: 24 },
  openingCount: furnished,
  stepSize: 6,
})
