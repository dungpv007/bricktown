/** Tap = pointer down -> up within 250 ms and < 8 px of movement, with no second finger involved. */
export const TAP_MAX_MS = 250
export const TAP_MAX_PX = 8

export interface TapDown {
  x: number
  y: number
  /** Event timestamp in ms. */
  t: number
  /** `PointerEvent.button` at pointerdown (0 = primary / touch / pen contact). */
  button: number
}

/**
 * Classifies a finished single-pointer gesture. `multi` is true when another pointer went down
 * during the gesture (pinch / two-finger pan), which is never a tap.
 */
export function isTap(down: TapDown, up: { x: number; y: number; t: number }, multi: boolean): boolean {
  if (multi || down.button !== 0) return false
  if (up.t - down.t > TAP_MAX_MS) return false
  return Math.hypot(up.x - down.x, up.y - down.y) < TAP_MAX_PX
}
