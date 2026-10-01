import type { PxRect } from './safeArea'

/**
 * Where the workshop baseplate was last drawn on screen (pixels relative to the canvas), updated
 * every frame by `PlateEdgeTracker`. Read by the dev handle so e2e specs can check the framing.
 */
export const plateScreen: { bounds: PxRect | null } = { bounds: null }
