import { create } from 'zustand'
import { DEFAULT_COLOR } from '../core/colors'
import { newId } from '../core/ids'
import { addBrick, paintBrick, removeBrick, rotateBrick, type PlaceError, type PlaceResult } from '../core/model'
import { nextRot } from '../core/rotation'
import type { Baseplate, Brick, BlueprintKind, PartCategory, Rot } from '../core/types'
import { createHistory } from './history'
import { useGame } from './useGame'

export type Tool = 'place' | 'paint' | 'delete' | 'rotate' | 'move'

export interface EditorState {
  tool: Tool
  partId: string
  color: number
  rot: Rot
  category: PartCategory
  lastError: PlaceError | null
  /** Brick picked up by the move tool, waiting to be placed. */
  carried: Brick | null
  canUndo: boolean
  canRedo: boolean
  setTool: (tool: Tool) => void
  setPart: (partId: string) => void
  setColor: (color: number) => void
  setCategory: (category: PartCategory) => void
  rotateCurrent: () => void
  place: (x: number, y: number, z: number) => void
  tapBrick: (id: string) => void
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

const history = createHistory<Brick[]>()
/** Bricks as they were before the move tool picked one up (restored if the pickup is cancelled). */
let pickupOrigin: Brick[] | null = null

const workshop = () => useGame.getState().data.workshop
const setBricks = (bricks: Brick[]) => useGame.getState().setWorkshop({ ...workshop(), bricks })

export const useEditor = create<EditorState>()((set, get) => {
  const syncHistory = () => set({ canUndo: history.canUndo(), canRedo: history.canRedo() })

  /** Applies a model-function result: records history on success, reports the error otherwise. */
  const commit = (before: Brick[], result: PlaceResult): boolean => {
    if (result.error) {
      set({ lastError: result.error })
      return false
    }
    history.push(before)
    setBricks(result.bricks)
    set({ lastError: null })
    syncHistory()
    return true
  }

  const reset = () => {
    history.clear()
    pickupOrigin = null
    set({ carried: null, lastError: null, canUndo: false, canRedo: false })
  }

  return {
    tool: 'place',
    partId: 'brick_2x4',
    color: DEFAULT_COLOR,
    rot: 0,
    category: 'brick',
    lastError: null,
    carried: null,
    canUndo: false,
    canRedo: false,

    setTool: (tool) => set({ tool }),
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
          set({ lastError: result.error })
          return
        }
        history.push(pickupOrigin)
        pickupOrigin = null
        setBricks(result.bricks)
        set({ carried: null, lastError: null })
        syncHistory()
        return
      }
      const bricks = workshop().bricks
      commit(bricks, addBrick(bricks, brick, workshop().baseplate))
    },

    tapBrick: (id) => {
      const { tool, color, carried } = get()
      if (carried) return
      const { bricks, baseplate } = workshop()
      const target = bricks.find((b) => b.id === id)
      if (!target) return
      switch (tool) {
        case 'paint':
          commit(bricks, { bricks: paintBrick(bricks, id, color), error: null })
          break
        case 'delete':
          commit(bricks, { bricks: removeBrick(bricks, id), error: null })
          break
        case 'rotate':
          commit(bricks, rotateBrick(bricks, id, baseplate))
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

    undo: () => {
      if (get().carried) {
        // Cancel the pickup.
        if (pickupOrigin) setBricks(pickupOrigin)
        pickupOrigin = null
        set({ carried: null, lastError: null })
        return
      }
      const prev = history.undo(workshop().bricks)
      if (prev) {
        setBricks(prev)
        set({ lastError: null })
      }
      syncHistory()
    },

    redo: () => {
      if (get().carried) return
      const next = history.redo(workshop().bricks)
      if (next) {
        setBricks(next)
        set({ lastError: null })
      }
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
