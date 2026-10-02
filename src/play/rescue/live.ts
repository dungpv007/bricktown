import { create } from 'zustand'

/**
 * What the HTML controls and the 3D scene share during a mission: whether 💦 is held, and how far
 * the fire is out (written by the scene in steps, so the button's ring re-renders a few times only).
 */
interface RescueLive {
  holding: boolean
  /** 0..1, 1 = the fire is out. */
  progress: number
  setHolding: (holding: boolean) => void
  setProgress: (progress: number) => void
  reset: () => void
}

export const useRescueLive = create<RescueLive>()((set) => ({
  holding: false,
  progress: 0,
  setHolding: (holding) => set({ holding }),
  setProgress: (progress) => set({ progress }),
  reset: () => set({ holding: false, progress: 0 }),
}))
