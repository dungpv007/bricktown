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

/** What the tracker needs from a pointer event. */
export interface PointerSample {
  pointerId: number
  x: number
  y: number
  t: number
  button: number
  isPrimary: boolean
}

export const sampleOf = (e: PointerEvent): PointerSample => ({
  pointerId: e.pointerId,
  x: e.clientX,
  y: e.clientY,
  t: e.timeStamp,
  button: e.button,
  isPrimary: e.isPrimary,
})

export interface GestureEnd {
  /** The released pointer is the one that started the gesture (other releases end nothing). */
  ended: boolean
  /** The gesture ended with a tap (see `isTap`). */
  tap: boolean
  /** Another pointer joined the gesture (pinch / two-finger pan). */
  multi: boolean
}

/**
 * Follows the pointers on a 3D view and classifies each gesture, shared by every scene. Feed it
 * pointerdown on the canvas and pointerup / pointercancel from the window. A primary pointer always
 * starts a fresh gesture, so a release that was lost (e.g. outside the window) cannot make every
 * later tap look like a pinch.
 */
export function createGestureTracker() {
  const active = new Set<number>()
  let start: (TapDown & { id: number }) | null = null
  let multi = false

  return {
    /** Returns true when this pointer starts a single-pointer gesture, false when it joins one. */
    down(p: PointerSample): boolean {
      if (p.isPrimary) active.clear()
      active.add(p.pointerId)
      if (active.size === 1) {
        start = { id: p.pointerId, x: p.x, y: p.y, t: p.t, button: p.button }
        multi = false
        return true
      }
      multi = true
      return false
    },
    up(p: PointerSample): GestureEnd {
      active.delete(p.pointerId)
      if (!start || start.id !== p.pointerId) return { ended: false, tap: false, multi }
      const tap = isTap(start, p, multi)
      start = null
      return { ended: true, tap, multi }
    },
    cancel(pointerId: number): void {
      active.delete(pointerId)
      if (start?.id === pointerId) start = null
    },
  }
}

export type GestureTracker = ReturnType<typeof createGestureTracker>
