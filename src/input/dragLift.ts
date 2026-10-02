/**
 * Timing and shapes of the Workshop's "lift and land" palette drag: the chip pops when the drag
 * begins, a lifted copy of the part follows the finger, fades into the 3D ghost over the view, flies
 * back to its chip when the drop places nothing, and a placed brick drops in with a squash, a bounce
 * and a puff of stud dust. Every animation stays under 300 ms.
 */

/** The chip's pop when a drag begins. */
export const POP_MS = 200
/** The lifted part flying back to its chip after a drop that placed nothing. */
export const RETURN_MS = 260
/** A placed brick landing: the drop, then the squash and bounce. */
export const LAND_MS = 280
/** Part of LAND_MS spent falling; the squash, bounce and puff fill the rest. */
export const FALL_END = 0.35
/** How high (world units) a landing brick starts above its spot. */
export const LAND_HEIGHT = 0.9
/** Deepest squash (fraction of the height) when the brick touches down. */
export const SQUASH = 0.22
/** Gap (px) between the finger and the lifted part's bottom edge on a touch screen, so the finger does not hide it. */
export const LIFT_TOUCH_PX = 24
/** The same gap for a mouse pointer (nothing to hide, it just floats a little above the cursor). */
export const LIFT_MOUSE_PX = 8

/** True when the player asked for less motion (no pop, bounce or puff then). */
export const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Where the lifted part's top-left corner goes, relative to the pointer, for a part `size` px wide
 * and tall: centred across the pointer and above it (well above a finger, just above a cursor).
 */
export function avatarOffset(size: number, touch: boolean): { dx: number; dy: number } {
  return { dx: -size / 2, dy: touch ? -(size + LIFT_TOUCH_PX) : -(size + LIFT_MOUSE_PX) }
}

export interface LandingPose {
  /** Height above the brick's spot (world units). */
  y: number
  /** Scale across (x and z) and up (y), about the brick's base. */
  sxz: number
  sy: number
  /** Progress of the stud-dust puff (0..1), or -1 before the brick touches down. */
  puff: number
}

/**
 * The landing brick at `t` (0..1 of LAND_MS), written into `out` (no allocation per frame): it falls
 * (accelerating, a little stretched), squashes when it touches down, bounces once and settles.
 */
export function landingPose(t: number, out: LandingPose): LandingPose {
  const k = Math.min(1, Math.max(0, t))
  if (k < FALL_END) {
    const f = k / FALL_END
    out.y = LAND_HEIGHT * (1 - f * f)
    out.sy = 1 + 0.08 * f
    out.sxz = 1 - 0.04 * f
    out.puff = -1
    return out
  }
  const u = (k - FALL_END) / (1 - FALL_END)
  const squash = k >= 1 ? 0 : SQUASH * Math.sin(u * Math.PI * 2) * (1 - u)
  out.y = 0
  out.sy = 1 - squash
  out.sxz = 1 + squash * 0.5
  out.puff = u
  return out
}

/** Ease-out for the puff: fast at first, slowing as it spreads. */
export const easeOut = (u: number): number => 1 - (1 - u) * (1 - u)
