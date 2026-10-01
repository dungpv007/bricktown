import { create } from 'zustand'
import type { TrayCard } from '../core/guidedTray'
import type { Rot } from '../core/types'
import type { ClientPoint } from '../input/paletteDrag'

/**
 * How a tray drag ended: `placed` (dropped in place), `missed` (released over the view but not on a
 * target: no penalty), `rejected` (normal mode: wrong spot or turn), `cancelled` (released outside
 * the view, a second finger, the app losing focus).
 */
export type DropOutcome = 'placed' | 'missed' | 'rejected' | 'cancelled'

export interface DraggedCard extends TrayCard {
  /** The card's quarter turns when the drag began (normal mode). */
  r: Rot
}

export interface GuidedDragStore {
  /** The tray card being dragged, or null. */
  card: DraggedCard | null
  /** Where the finger is (client pixels) while dragging. */
  pointer: ClientPoint | null
  /** The 3D view shows the piece (snapped, or aimed in normal mode), so the floating card hides. */
  inScene: boolean
  /** How the last drag ended and where (released there, else last seen there), for the tray's fly-back and shake; `seq` counts drags. */
  last: { outcome: DropOutcome; at: ClientPoint | null; card: DraggedCard; seq: number } | null
  /** Where the "drag me" hand points (client pixels): the next brick's spot on screen. */
  hintTo: ClientPoint | null
  begin: (card: DraggedCard) => void
  move: (pointer: ClientPoint, inScene: boolean) => void
  end: (outcome: DropOutcome, at: ClientPoint | null) => void
}

/** The tray drag in progress (Guided Build); transient, never saved. */
export const useGuidedDrag = create<GuidedDragStore>()((set, get) => ({
  card: null,
  pointer: null,
  inScene: false,
  last: null,
  hintTo: null,
  begin: (card) => set({ card, pointer: null, inScene: false }),
  move: (pointer, inScene) => {
    if (get().card) set({ pointer, inScene })
  },
  end: (outcome, at) => {
    const card = get().card
    if (!card) return
    set((s) => ({ card: null, pointer: null, inScene: false, last: { outcome, at: at ?? s.pointer, card, seq: (s.last?.seq ?? 0) + 1 } }))
  },
}))
