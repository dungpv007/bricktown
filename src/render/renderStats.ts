import type * as THREE from 'three'

/**
 * The live scene's renderer and frame counter, for the `?stats` overlay and (dev handle) e2e specs:
 * `renderer().getPixelRatio()`, frames drawn so far, and a way to ask for a frame.
 */
export const renderStats: {
  gl: THREE.WebGLRenderer | null
  /** Frames drawn by the live scene since it mounted. */
  frames: number
  /** Asks the live scene for a frame (render on demand); no-op without one. */
  invalidate: () => void
  /** Frames per second the scene's animations ask for right now (0: it renders only on demand). */
  loopFps: () => number
} = { gl: null, frames: 0, invalidate: () => undefined, loopFps: () => 0 }
