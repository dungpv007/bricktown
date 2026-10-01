import { cellsOf } from './rotation'
import type { Baseplate, Brick } from './types'

/** Studs added or removed per ➕/➖ tap; also one city cell. */
export const PLATE_STEP = 8
export const PLATE_MIN = 8
export const PLATE_MAX = 48

/** Baseplate edge: N = -Z, E = +X, S = +Z, W = -X (same as roads). */
export type PlateSide = 'N' | 'E' | 'S' | 'W'
export type ResizeDir = 'grow' | 'shrink'
export type ResizeError = 'max' | 'min' | 'not_empty'
const RESIZE_ERRORS: readonly string[] = ['max', 'min', 'not_empty'] satisfies ResizeError[]

/** True for the errors `resizeBaseplate` reports (as opposed to brick placement errors). */
export function isResizeError(error: string | null): error is ResizeError {
  return error !== null && RESIZE_ERRORS.includes(error)
}

export type ResizeResult = { bricks: Brick[]; baseplate: Baseplate } | { error: ResizeError }

const alongX = (side: PlateSide) => side === 'E' || side === 'W'

/**
 * How far every brick moves when `side` is resized. Brick coordinates start at the W / N edge, so
 * only resizing those sides moves them (keeping each brick over the same studs).
 */
export function plateShift(side: PlateSide, dir: ResizeDir): { dx: number; dz: number } {
  const step = dir === 'grow' ? PLATE_STEP : -PLATE_STEP
  return { dx: side === 'W' ? step : 0, dz: side === 'N' ? step : 0 }
}

/** True when any brick has a cell in the `PLATE_STEP`-wide strip along `side`. */
function stripOccupied(bricks: Brick[], baseplate: Baseplate, side: PlateSide): boolean {
  const inStrip = ([x, , z]: [number, number, number]): boolean => {
    switch (side) {
      case 'W': return x < PLATE_STEP
      case 'E': return x >= baseplate.w - PLATE_STEP
      case 'N': return z < PLATE_STEP
      case 'S': return z >= baseplate.d - PLATE_STEP
    }
  }
  return bricks.some((b) => cellsOf(b).some(inStrip))
}

function shrinkError(bricks: Brick[], baseplate: Baseplate, side: PlateSide): ResizeError | null {
  const size = alongX(side) ? baseplate.w : baseplate.d
  if (size - PLATE_STEP < PLATE_MIN) return 'min'
  return stripOccupied(bricks, baseplate, side) ? 'not_empty' : null
}

/** True when `side` can shrink: above the minimum size and no brick in its strip. */
export function canShrink(bricks: Brick[], baseplate: Baseplate, side: PlateSide): boolean {
  return shrinkError(bricks, baseplate, side) === null
}

/** Grows or shrinks the plate by `PLATE_STEP` studs on `side`, moving bricks so they stay on the same studs. */
export function resizeBaseplate(
  bricks: Brick[],
  baseplate: Baseplate,
  side: PlateSide,
  dir: ResizeDir,
): ResizeResult {
  const x = alongX(side)
  if (dir === 'grow') {
    if ((x ? baseplate.w : baseplate.d) + PLATE_STEP > PLATE_MAX) return { error: 'max' }
  } else {
    const error = shrinkError(bricks, baseplate, side)
    if (error) return { error }
  }
  const delta = dir === 'grow' ? PLATE_STEP : -PLATE_STEP
  const { dx, dz } = plateShift(side, dir)
  return {
    bricks: dx === 0 && dz === 0 ? bricks : bricks.map((b) => ({ ...b, x: b.x + dx, z: b.z + dz })),
    baseplate: x ? { w: baseplate.w + delta, d: baseplate.d } : { w: baseplate.w, d: baseplate.d + delta },
  }
}
