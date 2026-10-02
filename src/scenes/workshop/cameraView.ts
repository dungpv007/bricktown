/**
 * Which way the workshop camera looks, for the keyboard (the arrow keys move a brick relative to the
 * view). Set while the workshop view is mounted by `WorkshopWorld`; null otherwise.
 */
export const cameraView: {
  /** The camera's forward vector projected on the ground (world x, z; not normalised). */
  forward: (() => { x: number; z: number }) | null
} = { forward: null }
