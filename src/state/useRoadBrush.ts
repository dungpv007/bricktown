import { create } from 'zustand'
import type { RoadBrush } from '../core/avenues'

/**
 * The road tool's brush: 🛣️ a 4-lane avenue (2 cells wide, the default) or a 2-lane street (1 cell).
 * Painting and erasing roads both use it. Kept for the session (not saved).
 */
interface RoadBrushState {
  brush: RoadBrush
  setBrush: (brush: RoadBrush) => void
}

export const useRoadBrush = create<RoadBrushState>()((set) => ({
  brush: 'avenue',
  setBrush: (brush) => set({ brush }),
}))
