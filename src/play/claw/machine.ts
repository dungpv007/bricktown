import type { Brick } from '../../core/types'
import { brick } from '../kit'

/**
 * The claw machine cabinet and the arcade room's props, built from catalog bricks (baked and shared
 * like every game model). Brick units: studs across, plates up. The machine spans x 0..12, z 0..10
 * (front, toward the kid, at z = 10) and is drawn shifted by `MACHINE_OFFSET`, so its middle is the
 * world origin.
 */

const WHITE = 0
const BLACK = 1
const RED = 2
const YELLOW = 4
const DARK_GRAY = 8
const AZURE = 14
const GLASS = 15
const TRANS_RED = 16
const TRANS_BLUE = 17
const TRANS_YELLOW = 18
const TRANS_GREEN = 19
const DARK_BLUE = 21
const MEDIUM_BLUE = 23
const SILVER = 28
const PURPLE = 13

export const MACHINE_W = 12
export const MACHINE_D = 10
/** Studs: brick coordinates → world (the machine's middle on the origin). */
export const MACHINE_OFFSET: [number, number, number] = [-MACHINE_W / 2, 0, -MACHINE_D / 2]

/** Plates (brick y) of the machine's levels. */
const BASE_TOP = 12
/** The control deck's top (plates). */
const DECK_Y = 9
const FLOOR_Y = BASE_TOP // the pit floor plates
const GLASS_Y = FLOOR_Y + 1
const GLASS_COURSES = 6
const ROOF_Y = GLASS_Y + GLASS_COURSES * 3

/** World: the front's clear pane between its bottom and top glass courses (centre and size). */
export const FRONT_PANE = {
  at: [0, (GLASS_Y + 3 + (GLASS_COURSES - 2) * 1.5) * 0.4, MACHINE_D / 2 - 0.5] as [number, number, number],
  size: [MACHINE_W - 2, (GLASS_COURSES - 2) * 3 * 0.4] as [number, number],
}

/** World heights (studs) the scene needs. */
export const PIT_FLOOR = (FLOOR_Y + 1) * 0.4
export const ROOF_UNDERSIDE = ROOF_Y * 0.4
/** The chute hole in the pit floor (brick x / z, half-open ranges). */
const CHUTE_X: [number, number] = [8, 11]
const CHUTE_Z: [number, number] = [6, 9]
/** The prize door in the base's front (brick x range) and its height (plates). */
const DOOR_X: [number, number] = [7, 11]
const DOOR_Y: [number, number] = [3, 9]
/** World: the middle of the prize door's sill, where a won prize comes out. */
export const TRAY: [number, number, number] = [(DOOR_X[0] + DOOR_X[1]) / 2 + MACHINE_OFFSET[0], 3 * 0.4 + 0.4, MACHINE_D + 0.9 + MACHINE_OFFSET[2]]
/** World: the joystick's and the big button's pivots (on the control deck). */
export const JOYSTICK_AT: [number, number, number] = [1.5 + MACHINE_OFFSET[0], DECK_Y * 0.4, 11 + MACHINE_OFFSET[2]]
export const BUTTON_AT: [number, number, number] = [4.3 + MACHINE_OFFSET[0], DECK_Y * 0.4, 11 + MACHINE_OFFSET[2]]

/** A row of 1-wide bricks along x from x0 to x1 (exclusive) at plate y, row z. */
function runX(out: Brick[], x0: number, x1: number, y: number, z: number, c: number) {
  let x = x0
  while (x < x1) {
    const left = x1 - x
    const len = left >= 6 ? 6 : left >= 4 ? 4 : left >= 2 ? 2 : 1
    out.push(len === 1 ? brick('brick_1x1', c, x, y, z) : brick(`brick_1x${len}`, c, x, y, z, 1))
    x += len
  }
}

/** A row of 1-wide bricks along z from z0 to z1 (exclusive) at plate y, column x. */
function runZ(out: Brick[], z0: number, z1: number, y: number, x: number, c: number) {
  let z = z0
  while (z < z1) {
    const left = z1 - z
    const len = left >= 6 ? 6 : left >= 4 ? 4 : left >= 2 ? 2 : 1
    out.push(len === 1 ? brick('brick_1x1', c, x, y, z) : brick(`brick_1x${len}`, c, x, y, z, 0))
    z += len
  }
}

/** Covers x0..x1 × z0..z1 with plates at y, skipping the studs `skip` says. */
function plateArea(out: Brick[], x0: number, z0: number, x1: number, z1: number, y: number, c: number, skip: (x: number, z: number) => boolean = () => false) {
  for (let z = z0; z < z1; z++) {
    let x = x0
    while (x < x1) {
      if (skip(x, z)) {
        x++
        continue
      }
      let len = 0
      while (x + len < x1 && len < 4 && !skip(x + len, z)) len++
      if (len === 4) out.push(brick('plate_1x4', c, x, y, z, 1))
      else if (len >= 2) {
        out.push(brick('plate_1x2', c, x, y, z, 1))
        len = 2
      } else out.push(brick('plate_1x1', c, x, y, z))
      x += len
    }
  }
}

/** The machine without its moving parts (joystick, button, claw). */
export function machineBricks(): Brick[] {
  const out: Brick[] = []
  // The base: four courses of walls, a yellow stripe, and the prize door's opening in front.
  const baseColor = (y: number) => (y === 6 ? YELLOW : RED)
  for (const y of [0, 3, 6, 9]) {
    const c = baseColor(y)
    runX(out, 0, MACHINE_W, y, 0, c)
    const inDoor = y >= DOOR_Y[0] && y < DOOR_Y[1]
    if (inDoor) {
      runX(out, 0, DOOR_X[0], y, MACHINE_D - 1, c)
      runX(out, DOOR_X[1], MACHINE_W, y, MACHINE_D - 1, c)
    } else runX(out, 0, MACHINE_W, y, MACHINE_D - 1, c)
    runZ(out, 1, MACHINE_D - 1, y, 0, c)
    runZ(out, 1, MACHINE_D - 1, y, MACHINE_W - 1, c)
  }
  // The prize door: a black sill plate sticking out (the prize lands on it) and a yellow frame top.
  out.push(brick('plate_2x4', BLACK, DOOR_X[0], 3, MACHINE_D - 2, 1))
  out.push(brick('plate_2x4', BLACK, DOOR_X[0], 3, MACHINE_D, 1))
  // The pit floor (blue plates), with the chute's hole in the front right corner.
  const inChute = (x: number, z: number) => x >= CHUTE_X[0] && x < CHUTE_X[1] && z >= CHUTE_Z[0] && z < CHUTE_Z[1]
  plateArea(out, 0, 0, MACHINE_W, MACHINE_D, FLOOR_Y, MEDIUM_BLUE, inChute)

  // The control deck: a yellow shelf across the front left, one course under the base's top (so the
  // joystick and the button stay below the kid's view of the pit), with the coin slot on it.
  out.push(brick('brick_2x6', YELLOW, 0, DECK_Y - 3, MACHINE_D, 1))
  out.push(brick('brick_1x2', YELLOW, 6, DECK_Y - 3, MACHINE_D))
  out.push(brick('plate_1x2', DARK_GRAY, 6, DECK_Y, MACHINE_D))
  out.push(brick('tile_1x2', YELLOW, 6, DECK_Y + 1, MACHINE_D))

  // The glass box: red corner pillars, clear sides, a purple back (prizes show up against it). The
  // front has a clear course at the bottom and the top: between them, one big pane (see FRONT_PANE)
  // so the kid sees the prizes without the bricks' edges in the way.
  for (let i = 0; i < GLASS_COURSES; i++) {
    const y = GLASS_Y + i * 3
    for (const [x, z] of [[0, 0], [MACHINE_W - 1, 0], [0, MACHINE_D - 1], [MACHINE_W - 1, MACHINE_D - 1]]) out.push(brick('brick_1x1', RED, x, y, z))
    if (i === 0 || i === GLASS_COURSES - 1) runX(out, 1, MACHINE_W - 1, y, MACHINE_D - 1, GLASS)
    runZ(out, 1, MACHINE_D - 1, y, 0, GLASS)
    runZ(out, 1, MACHINE_D - 1, y, MACHINE_W - 1, GLASS)
    runX(out, 1, MACHINE_W - 1, y, 0, i === GLASS_COURSES - 1 ? AZURE : PURPLE)
  }
  // The chute's low trans-yellow fence (one course) inside the box.
  runZ(out, CHUTE_Z[0], CHUTE_Z[1], GLASS_Y, CHUTE_X[0] - 1, TRANS_YELLOW)
  runX(out, CHUTE_X[0] - 1, CHUTE_X[1], GLASS_Y, CHUTE_Z[0] - 1, TRANS_YELLOW)

  // The roof: yellow plates, a red and yellow sign with stars, and coloured lights on the corners.
  plateArea(out, 0, 0, MACHINE_W, MACHINE_D, ROOF_Y, YELLOW)
  runX(out, 2, 10, ROOF_Y + 1, MACHINE_D - 2, RED)
  runX(out, 2, 10, ROOF_Y + 4, MACHINE_D - 2, PURPLE)
  for (const x of [2, 4, 7, 9]) out.push(brick('print_star_1x1', YELLOW, x, ROOF_Y + 7, MACHINE_D - 2))
  for (const [x, z, c] of [[0, 0, TRANS_RED], [MACHINE_W - 1, 0, TRANS_BLUE], [0, MACHINE_D - 1, TRANS_GREEN], [MACHINE_W - 1, MACHINE_D - 1, TRANS_YELLOW]]) {
    out.push(brick('round_1x1', c, x, ROOF_Y + 1, z))
  }
  return out
}

/** The joystick: a black base, a grey stick, a red ball (centred: the BrickModel puts its footprint's middle on the origin). */
export const JOYSTICK: Brick[] = [brick('plate_2x2', BLACK, 0, 0, 0), brick('round_1x1', SILVER, 0.5, 1, 0.5), brick('round_1x1', RED, 0.5, 4, 0.5)]

/** The big red drop button on its white collar (centred like the joystick). */
export const BUTTON_COLLAR: Brick[] = [brick('round_2x2', WHITE, 0, 0, 0)]
export const BUTTON_CAP: Brick[] = [brick('dish_2x2', RED, 0, 0, 0)]

/** A video game cabinet for the room: a body, a glowing screen and a little control shelf. */
export function gameCabinet(body: number): Brick[] {
  return [
    brick('brick_2x4', body, 0, 0, 0, 1),
    brick('brick_2x4', body, 0, 3, 0, 1),
    brick('brick_2x4', body, 0, 6, 0, 1),
    brick('brick_2x4', body, 0, 9, 0, 1),
    brick('brick_2x4', body, 0, 12, 0, 1),
    brick('window_1x4x3', TRANS_BLUE, 0, 15, 1),
    brick('brick_1x4', body, 0, 15, 0, 1),
    brick('brick_2x4', YELLOW, 0, 24, 0, 1),
    brick('plate_1x4', BLACK, 0, 15, 2, 1),
    brick('round_1x1', TRANS_RED, 1, 15, 2),
    brick('round_1x1', TRANS_GREEN, 2, 15, 2),
  ]
}

export const CABINET_COLORS = [DARK_BLUE, PURPLE] as const
