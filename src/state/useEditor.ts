import { create } from 'zustand'
import * as sfx from '../audio/sfx'
import { plateColor, plateShift, resizeBaseplate, type PlateSide, type ResizeDir, type ResizeError } from '../core/baseplate'
import { DEFAULT_COLOR } from '../core/colors'
import { newId } from '../core/ids'
import { addBrick, paintBrick, removeBrick, rotateBrick, type PlaceError, type PlaceResult } from '../core/model'
import { nextRot } from '../core/rotation'
import type { Baseplate, Brick, BlueprintKind, PartCategory, Rot } from '../core/types'
import { createHistory } from './history'
import { useApp } from './useApp'
import { useGame } from './useGame'

export type Tool = 'place' | 'paint' | 'delete' | 'rotate' | 'move'
export type EditorError = PlaceError | ResizeError

/**
 * A camera move (in studs) matching bricks that just slid to new coordinates after the plate was
 * resized on its W / N side, so they stay put on screen. `seq` changes on every such move.
 */
export interface ViewShift { seq: number; dx: number; dz: number }

export interface EditorState {
  tool: Tool
  partId: string
  color: number
  rot: Rot
  category: PartCategory
  lastError: EditorError | null
  /** Incremented on every rejected action, so UI can react to repeats of the same error. */
  errorSeq: number
  /** Brick picked up by the move tool, waiting to be placed. */
  carried: Brick | null
  canUndo: boolean
  canRedo: boolean
  viewShift: ViewShift
  /** Changes whenever a different model is loaded, so the camera re-frames it. */
  frameSeq: number
  /** Switching away from the move tool puts a carried brick back where it was. */
  setTool: (tool: Tool) => void
  setPart: (partId: string) => void
  setColor: (color: number) => void
  setCategory: (category: PartCategory) => void
  rotateCurrent: () => void
  place: (x: number, y: number, z: number) => void
  tapBrick: (id: string) => void
  /** Puts a brick picked up by the move tool back where it was (no-op when none is carried). */
  cancelCarry: () => void
  /** Grows or shrinks the baseplate by one step on `side` (undoable). */
  resizePlate: (side: PlateSide, dir: ResizeDir) => void
  /** Paints the baseplate colour index `c` (undoable; no-op when it already shows that colour). */
  setPlateColor: (c: number) => void
  undo: () => void
  redo: () => void
  newModel: (kind: BlueprintKind, baseplate: Baseplate) => void
  loadBricks: (
    bricks: Brick[],
    kind: BlueprintKind,
    baseplate: Baseplate,
    editingBlueprintId?: string,
  ) => void
}

/**
 * One undo step: the model before a change. `origin` is where model coordinate (0, 0) sat in the
 * view (in studs) at that time; resizing the W / N side moves it, and undo moves the camera back.
 */
interface Snapshot { bricks: Brick[]; baseplate: Baseplate; origin: { x: number; z: number } }

const history = createHistory<Snapshot>()
let origin = { x: 0, z: 0 }
/** Bricks as they were before the move tool picked one up (restored if the pickup is cancelled). */
let pickupOrigin: Brick[] | null = null

const workshop = () => useGame.getState().data.workshop
const setBricks = (bricks: Brick[]) => useGame.getState().setWorkshop({ ...workshop(), bricks })
const snapshot = (bricks: Brick[] = workshop().bricks): Snapshot => ({ bricks, baseplate: workshop().baseplate, origin })

export const useEditor = create<EditorState>()((set, get) => {
  const syncHistory = () => set({ canUndo: history.canUndo(), canRedo: history.canRedo() })
  const reject = (error: EditorError) => {
    set((s) => ({ lastError: error, errorSeq: s.errorSeq + 1 }))
    sfx.error()
  }

  /** Applies a model-function result: records history and plays `sound` on success, reports the error otherwise. */
  const commit = (before: Brick[], result: PlaceResult, sound: () => void): boolean => {
    if (result.error) {
      reject(result.error)
      return false
    }
    history.push(snapshot(before))
    setBricks(result.bricks)
    set({ lastError: null })
    syncHistory()
    sound()
    return true
  }

  const cancelCarry = () => {
    if (!get().carried) return
    if (pickupOrigin) setBricks(pickupOrigin)
    pickupOrigin = null
    set({ carried: null, lastError: null })
  }

  /** Makes `next` the current model, moving the camera along with its origin. */
  const restore = (next: Snapshot) => {
    useGame.getState().setWorkshop({ ...workshop(), bricks: next.bricks, baseplate: next.baseplate })
    const dx = origin.x - next.origin.x
    const dz = origin.z - next.origin.z
    origin = next.origin
    if (dx !== 0 || dz !== 0) set((s) => ({ viewShift: { seq: s.viewShift.seq + 1, dx, dz } }))
    set({ lastError: null })
  }

  const reset = () => {
    history.clear()
    pickupOrigin = null
    origin = { x: 0, z: 0 }
    set((s) => ({ carried: null, lastError: null, canUndo: false, canRedo: false, frameSeq: s.frameSeq + 1 }))
  }

  return {
    tool: 'place',
    partId: 'brick_2x4',
    color: DEFAULT_COLOR,
    rot: 0,
    category: 'brick',
    lastError: null,
    errorSeq: 0,
    carried: null,
    canUndo: false,
    canRedo: false,
    viewShift: { seq: 0, dx: 0, dz: 0 },
    frameSeq: 0,

    setTool: (tool) => {
      if (tool !== 'move') cancelCarry()
      set({ tool })
    },
    cancelCarry,
    setPart: (partId) => set({ partId }),
    setColor: (color) => set({ color }),
    setCategory: (category) => set({ category }),
    rotateCurrent: () => set((s) => ({ rot: nextRot(s.rot) })),

    place: (x, y, z) => {
      const { carried, partId, color, rot } = get()
      const brick: Brick = carried
        ? { ...carried, x, y, z, r: rot }
        : { id: newId(), p: partId, x, y, z, r: rot, c: color }
      if (carried && pickupOrigin) {
        // Completing a move: the pre-pickup bricks form the single undo step.
        const result = addBrick(workshop().bricks, brick, workshop().baseplate)
        if (result.error) {
          reject(result.error)
          return
        }
        history.push(snapshot(pickupOrigin))
        pickupOrigin = null
        setBricks(result.bricks)
        set({ carried: null, lastError: null })
        syncHistory()
        sfx.snap()
        return
      }
      const bricks = workshop().bricks
      commit(bricks, addBrick(bricks, brick, workshop().baseplate), sfx.snap)
    },

    tapBrick: (id) => {
      const { tool, color, carried } = get()
      if (carried) return
      const { bricks, baseplate } = workshop()
      const target = bricks.find((b) => b.id === id)
      if (!target) return
      switch (tool) {
        case 'paint':
          if (target.c === color) return // already this colour: nothing to undo
          commit(bricks, { bricks: paintBrick(bricks, id, color), error: null }, sfx.paint)
          break
        case 'delete':
          commit(bricks, { bricks: removeBrick(bricks, id), error: null }, sfx.pop)
          break
        case 'rotate':
          commit(bricks, rotateBrick(bricks, id, baseplate), sfx.snap)
          break
        case 'move':
          pickupOrigin = bricks
          setBricks(removeBrick(bricks, id))
          set({ carried: target, partId: target.p, color: target.c, rot: target.r, lastError: null })
          break
        case 'place':
          break
      }
    },

    resizePlate: (side, dir) => {
      cancelCarry()
      const { bricks, baseplate } = workshop()
      const result = resizeBaseplate(bricks, baseplate, side, dir)
      if ('error' in result) {
        reject(result.error)
        return
      }
      history.push(snapshot())
      // Bricks moved by (dx, dz) to stay on the same studs, so the model origin moved the other way.
      const { dx, dz } = plateShift(side, dir)
      restore({ ...result, origin: { x: origin.x - dx, z: origin.z - dz } })
      syncHistory()
      if (dir === 'grow') sfx.snap()
      else sfx.pop()
    },

    setPlateColor: (c) => {
      cancelCarry()
      const { baseplate, kind } = workshop()
      if (plateColor(baseplate, kind) === c) return
      history.push(snapshot())
      restore({ ...snapshot(), baseplate: { ...baseplate, c } })
      syncHistory()
      sfx.paint()
    },

    undo: () => {
      if (get().carried) {
        cancelCarry()
        return
      }
      const prev = history.undo(snapshot())
      if (prev) restore(prev)
      syncHistory()
    },

    redo: () => {
      if (get().carried) return
      const next = history.redo(snapshot())
      if (next) restore(next)
      syncHistory()
    },

    newModel: (kind, baseplate) => {
      useGame.getState().setWorkshop({ kind, baseplate, bricks: [] })
      reset()
    },

    loadBricks: (bricks, kind, baseplate, editingBlueprintId) => {
      useGame.getState().setWorkshop(
        editingBlueprintId === undefined
          ? { kind, baseplate, bricks }
          : { kind, baseplate, bricks, editingBlueprintId },
      )
      reset()
    },
  }
})

// Leaving the workshop with a brick in hand would lose it: put it back.
useApp.subscribe((state, prev) => {
  if (prev.mode === 'workshop' && state.mode !== 'workshop') useEditor.getState().cancelCarry()
})

/** True when the workshop model has any brick, counting one currently carried by the move tool. */
export function workshopHasBricks(): boolean {
  return useGame.getState().data.workshop.bricks.length > 0 || useEditor.getState().carried !== null
}

/** Reactive version of {@link workshopHasBricks}. */
export function useWorkshopHasBricks(): boolean {
  const stored = useGame((s) => s.data.workshop.bricks.length > 0)
  const carrying = useEditor((s) => s.carried !== null)
  return stored || carrying
}
