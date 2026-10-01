import type { PxRect } from './safeArea'

/**
 * Where the workshop baseplate was last drawn on screen (pixels relative to the canvas), updated
 * every frame by `PlateEdgeTracker`, and `project` (set while the workshop view is mounted):
 * where a world point appears on screen (client pixels). Read by the dev handle so e2e specs can
 * check the framing and aim at bricks.
 */
export const plateScreen: {
  bounds: PxRect | null
  project: ((p: [number, number, number]) => { x: number; y: number }) | null
} = { bounds: null, project: null }
