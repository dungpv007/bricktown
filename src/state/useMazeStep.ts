import { create } from 'zustand'
import type { StepDir } from '../core/mazeStep'

/** A direction held down by one source: a key (`key:ArrowUp`) or a finger / the mouse (`ptr:3`). */
interface Held {
  dir: StepDir
  source: string
}

/**
 * The block-step controls of the maze's top-down view (D-pad and keys). A press both steps (or
 * queues a step) and holds its direction, which repeats steps until released. The car's step
 * driver drains `presses` every physics step and reads the latest held direction.
 */
export interface MazeStepState {
  /** Held directions, the latest last. */
  held: readonly Held[]
  /** Presses not yet taken by the car. */
  presses: readonly StepDir[]
  /** The car is moving block by block (its physics is off); set by the step driver. */
  active: boolean
  press: (dir: StepDir, source: string) => void
  release: (source: string) => void
  /** The presses since the last call (and forgets them). */
  take: () => readonly StepDir[]
  /** The direction that repeats while held: the one pressed last. */
  heldDir: () => StepDir | null
  setActive: (active: boolean) => void
  /** Lets go of every direction (leaving the mode, window blur, app hidden). */
  reset: () => void
}

const NONE: readonly StepDir[] = []

export const useMazeStep = create<MazeStepState>()((set, get) => ({
  held: [],
  presses: NONE,
  active: false,
  press: (dir, source) =>
    set({ held: [...get().held.filter((h) => h.source !== source), { dir, source }], presses: [...get().presses, dir] }),
  release: (source) => {
    if (get().held.some((h) => h.source === source)) set({ held: get().held.filter((h) => h.source !== source) })
  },
  take: () => {
    const presses = get().presses
    if (presses.length > 0) set({ presses: NONE })
    return presses
  },
  heldDir: () => get().held.at(-1)?.dir ?? null,
  setActive: (active) => {
    if (get().active !== active) set({ active })
  },
  reset: () => set({ held: [], presses: NONE }),
}))
