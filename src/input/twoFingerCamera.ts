/**
 * Two-finger camera turns on a map view (the City), on top of the controls' own pinch-zoom and
 * two-finger pan: twisting the fingers turns the view around, and pushing both fingers up or down
 * side by side tilts it (as on phone map apps).
 */

/** Two touch points, in screen pixels. */
export interface TouchPair {
  ax: number
  ay: number
  bx: number
  by: number
}

/** `undecided` until the fingers have moved far enough to tell; `tilt`: a side-by-side push; `turn`: anything else. */
export type TwoFingerMode = 'undecided' | 'turn' | 'tilt'

/** Finger travel (px) before a two-finger gesture is classified. */
export const DECIDE_PX = 12
/** Twist (radians) before the view starts turning, so a plain pinch does not turn it by accident. */
export const TURN_START = 0.15
/** Tilt per pixel of finger travel (radians). */
export const TILT_PER_PX = 0.006

/** Angle of the line from finger a to finger b (radians, screen axes). */
const lineAngle = (p: TouchPair) => Math.atan2(p.by - p.ay, p.bx - p.ax)

/** Wraps an angle to (-PI, PI]. */
const wrap = (a: number) => {
  let r = a % (2 * Math.PI)
  if (r <= -Math.PI) r += 2 * Math.PI
  if (r > Math.PI) r -= 2 * Math.PI
  return r
}

/** How much the line between the fingers turned from `prev` to `next` (radians; clockwise on screen is positive). */
export function twist(prev: TouchPair, next: TouchPair): number {
  return wrap(lineAngle(next) - lineAngle(prev))
}

/** Mean vertical travel of the two fingers from `prev` to `next` (px; down is positive). */
export function shove(prev: TouchPair, next: TouchPair): number {
  return (next.ay - prev.ay + (next.by - prev.by)) / 2
}

/**
 * What a two-finger gesture is, from where the fingers went down (`start`) and where they are now:
 * a tilt when both fingers, side by side, move mostly vertically the same way by a similar amount;
 * a turn (which also pinches and pans) otherwise.
 */
export function classifyTwoFinger(start: TouchPair, now: TouchPair): TwoFingerMode {
  const dax = now.ax - start.ax
  const day = now.ay - start.ay
  const dbx = now.bx - start.bx
  const dby = now.by - start.by
  if (Math.max(Math.hypot(dax, day), Math.hypot(dbx, dby)) < DECIDE_PX) return 'undecided'
  const sideBySide = Math.abs(start.bx - start.ax) > Math.abs(start.by - start.ay)
  const vertical = Math.abs(day) > 2 * Math.abs(dax) && Math.abs(dby) > 2 * Math.abs(dbx)
  // Each finger's move arrives as its own event, so one finger may be a step behind the other.
  const together = Math.sign(day) === Math.sign(dby) && Math.min(Math.abs(day), Math.abs(dby)) >= 0.4 * Math.max(Math.abs(day), Math.abs(dby))
  return sideBySide && vertical && together ? 'tilt' : 'turn'
}
