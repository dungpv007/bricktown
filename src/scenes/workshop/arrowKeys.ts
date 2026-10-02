export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export const isArrowKey = (key: string): key is ArrowKey =>
  key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'

/** `-0` would not equal `0` in a deep comparison. */
const clean = (n: number) => n + 0

/**
 * One stud step (world x / z) for an arrow key, relative to the camera. `forward` is the camera's look
 * direction projected on the ground (it need not be unit length); it is snapped to the nearest world axis
 * (a view exactly diagonal goes to z). Up is away from the viewer, down towards them, and right is that
 * forward turned clockwise seen from above (the default view looks along -z, with +x to the right).
 * A zero or non-finite `forward` counts as the default view.
 */
export function arrowStep(forward: { x: number; z: number }, key: ArrowKey): { dx: number; dz: number } {
  let { x, z } = forward
  if (!Number.isFinite(x) || !Number.isFinite(z) || (x === 0 && z === 0)) {
    x = 0
    z = -1
  }
  // Forward snapped to an axis: (fx, fz) is one of (±1, 0), (0, ±1).
  const fx = Math.abs(x) > Math.abs(z) ? Math.sign(x) : 0
  const fz = fx === 0 ? Math.sign(z) : 0
  switch (key) {
    case 'ArrowUp': return { dx: clean(fx), dz: clean(fz) }
    case 'ArrowDown': return { dx: clean(-fx), dz: clean(-fz) }
    case 'ArrowRight': return { dx: clean(-fz), dz: clean(fx) }
    case 'ArrowLeft': return { dx: clean(fz), dz: clean(-fx) }
  }
}
