import type { Builder } from './builder'

/**
 * The shared shell of the town shops (sushi restaurant, bakery, toy shop, grocery): a 14x12 shop on
 * a 16x16 plate with a sidewalk strip in front. The door faces -Z between two display windows;
 * striped awnings run along the front and the back just under the flat roof (so a shop reads as one
 * from every side), and a big sign board (printed on both faces) stands on the roof above the door.
 */
export const SHOP = { X0: 1, X1: 14, Z0: 3, Z1: 14 } as const
/** Seven courses on the sides (y = 1..21); the front and back have six, their awning is the seventh. */
const COURSES = 7
const ROOF_Y = 1 + COURSES * 3
/** The flat roof's height (plates): a caller's own roof sign stands on it. */
export const SHOP_ROOF_Y = ROOF_Y
const GLASS = 15

export interface ShopLook {
  /** Wall colour per course (0 = bottom). */
  wall: (course: number) => number
  /** The awning's two stripe colours, left to right. */
  awning: [number, number]
  roof: number
  door: number
  /** A `board_*` part and the board's colour (it frames the print); none: the roof stays clear for the caller's own sign. */
  board?: [string, number]
}

/** Floor plates of the shop (y = 0): call first, before the furniture. */
export function shopFloor(b: Builder, color: number): void {
  const { X0, X1, Z0, Z1 } = SHOP
  b.plates(0, X0, Z0, X1, Z1, color)
}

/** Walls, door, windows, awning, roof and sign: call after the floor, furniture and figures. */
export function shopShell(b: Builder, look: ShopLook): void {
  const { X0, X1, Z0, Z1 } = SHOP
  const windows = [{ from: 2, to: 5, c0: 1, c1: 3 }, { from: 10, to: 13, c0: 1, c1: 3 }]
  // The front: a door in the middle (full height) between two display windows.
  b.wall({
    axis: 'x', fixed: Z0, from: X0, to: X1, y: 1, courses: COURSES - 1, color: look.wall,
    gaps: [{ from: 6, to: 9, c0: 0, c1: COURSES - 2 }, ...windows],
  })
  // The back: a big window in the middle and a small one each side.
  b.wall({
    axis: 'x', fixed: Z1, from: X0, to: X1, y: 1, courses: COURSES - 1, color: look.wall,
    gaps: [{ from: 6, to: 9, c0: 1, c1: 3 }, { from: 2, to: 3, c0: 2, c1: 3 }, { from: 12, to: 13, c0: 2, c1: 3 }],
  })
  for (const x of [X0, X1]) {
    b.wall({
      axis: 'z', fixed: x, from: Z0 + 1, to: Z1 - 1, y: 1, courses: COURSES, color: look.wall,
      gaps: [{ from: 7, to: 10, c0: 1, c1: 3 }],
    })
  }
  b.add('door_1x4x6', 6, 1, Z0, 0, look.door)
  for (const x of [2, 10]) b.add('window_1x4x3', x, 4, Z0, 0, GLASS)
  b.add('window_1x4x3', 6, 4, Z1, 0, GLASS)
  for (const x of [2, 12]) b.add('window_1x2x2', x, 7, Z1, 0, GLASS)
  for (const x of [X0, X1]) b.add('window_1x4x3', x, 4, 7, 1, GLASS)

  // The awnings: a row of slopes on the front wall (and over the door), low side out over the
  // sidewalk, and another along the back.
  for (let x = X0, i = 0; x < X1; x += 2, i++) {
    b.add('slope_2x2', x, ROOF_Y - 3, Z0 - 1, 2, look.awning[i % 2])
    b.add('slope_2x2', x, ROOF_Y - 3, Z1, 0, look.awning[i % 2])
  }

  // Flat roof, and the sign board on it above the door.
  b.plates(ROOF_Y, X0, Z0, X1, Z1, look.roof)
  if (look.board) b.add(look.board[0], 5, ROOF_Y + 1, Z0 + 1, 0, look.board[1])
}
