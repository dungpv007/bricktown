import type { PxRect } from './safeArea'

/**
 * Where the workshop baseplate was last drawn on screen (pixels relative to the canvas) and the
 * camera pose then (position and quaternion, rounded to 1e-3, plus a frame counter), updated every
 * frame by `PlateEdgeTracker`, and `project` (set while the workshop view is mounted): where a
 * world point appears on screen (client pixels). Read by the dev handle so e2e specs can check the
 * framing, aim at bricks and wait for the camera to come to rest.
 */
export const plateScreen: {
  bounds: PxRect | null
  pose: { frame: number; camera: number[] } | null
  project: ((p: [number, number, number]) => { x: number; y: number }) | null
} = { bounds: null, pose: null, project: null }
