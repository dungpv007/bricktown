import { create } from 'zustand'
import type { FigStyle } from '../core/types'
import type { ClientPoint } from '../input/paletteDrag'

/** What a Workshop palette chip lifts: a part in the current colour, or a ready-made figure. */
export type LiftItem = { kind: 'part'; partId: string; color: number } | { kind: 'fig'; fig: FigStyle }

/**
 * How a palette drag ended: `placed` (the brick landed), `rejected` (over the plate, but it does not
 * fit there), `missed` (released outside the plate: over the HUD or the sky), `cancelled` (a lost
 * pointer, the app losing focus).
 */
export type LiftOutcome = 'placed' | 'rejected' | 'missed' | 'cancelled'

export interface LiftDrag {
  item: LiftItem
  /** The chip it came from (its data-testid), where it flies back to. */
  source: string
  /** Dragged with a finger (lifted well above it) rather than a mouse. */
  touch: boolean
}

export interface PaletteLiftStore {
  /** The palette drag in progress, or null. */
  drag: LiftDrag | null
  /** Where the pointer is (client pixels) while dragging; null until it first moves. */
  pointer: ClientPoint | null
  /** The 3D view shows the part as a ghost, so the lifted copy fades into it. */
  inScene: boolean
  /** How the last drag ended and where (released there, else last seen there); `seq` counts drags. */
  last: { outcome: LiftOutcome; at: ClientPoint | null; drag: LiftDrag; seq: number } | null
  begin: (drag: LiftDrag) => void
  move: (pointer: ClientPoint, inScene: boolean) => void
  end: (outcome: LiftOutcome, at: ClientPoint | null) => void
}

/** The Workshop palette drag in progress (the lifted part's state); transient, never saved. */
export const usePaletteLift = create<PaletteLiftStore>()((set, get) => ({
  drag: null,
  pointer: null,
  inScene: false,
  last: null,
  begin: (drag) => set({ drag, pointer: null, inScene: false }),
  move: (pointer, inScene) => {
    if (get().drag) set({ pointer, inScene })
  },
  end: (outcome, at) => {
    const drag = get().drag
    if (!drag) return
    set((s) => ({ drag: null, pointer: null, inScene: false, last: { outcome, at: at ?? s.pointer, drag, seq: (s.last?.seq ?? 0) + 1 } }))
  },
}))
