import { create } from 'zustand'
import * as sfx from '../audio/sfx'
import { plateColor, plateShift, resizeBaseplate, type PlateSide, type ResizeDir, type ResizeError } from '../core/baseplate'
import { DEFAULT_COLOR } from '../core/colors'
import { DEFAULT_FIG, figColor, figKey, figOf, isFigure, MINIFIG_PART } from '../core/figures'
import { newId } from '../core/ids'
import { duplicateSpot, type Spot } from '../core/duplicate'
import { addBrick, moveBrick, paintBrick, removeBrick, restyleFigure, rotateBrick, type PlaceError, type PlaceResult } from '../core/model'
import { nextRot } from '../core/rotation'
import type { Baseplate, Brick, BlueprintKind, FigStyle, PartCategory, Rot } from '../core/types'
import { createHistory } from './history'
import { useGame } from './useGame'

export type EditorError = PlaceError | ResizeError

/**
 * A camera move (in studs) matching bricks that just slid to new coordinates after the plate was
 * resized on its W / N side, so they stay put on screen. `seq` changes on every such move.
 */
export interface ViewShift { seq: number; dx: number; dz: number }

/** What the open figure editor changes: a placed figure, or (`brickId: null`) the figure to place next. */
export interface FigEditorTarget { brickId: string | null }

export interface EditorState {
  /** The part placed by a tap on the empty plate (or dragged from the palette). */
  partId: string
  color: number
  /** The look of the next minifigure placed (when `partId` is the minifig part). */
  fig: FigStyle
  rot: Rot
  category: PartCategory
  /** The figure editor, when open. */
  figEditor: FigEditorTarget | null
  lastError: EditorError | null
  /** Incremented on every rejected action, so UI can react to repeats of the same error. */
  errorSeq: number
  /** The brick the action bar (rotate, recolour, delete, duplicate) works on. */
  selectedId: string | null
  /** Incremented by `hintColors`: the colour column pulses to show where recolouring happens. */
  colorHintSeq: number
  canUndo: boolean
  canRedo: boolean
  viewShift: ViewShift
  /** Changes whenever a different model is loaded, so the camera re-frames it. */
  frameSeq: number
  /** The baseplate ➕/➖ edge buttons are shown (📐 toggles them; touching the model hides them). */
  plateResize: boolean
  setPlateResize: (on: boolean) => void
  setPart: (partId: string) => void
  setColor: (color: number) => void
  setFig: (fig: FigStyle) => void
  /** Gives placed figure `id` a new look (undoable; no-op when it already looks like that). */
  restyleFigure: (id: string, fig: FigStyle) => void
  /** Opens the figure editor for placed figure `brickId`, or for the figure to place next. */
  openFigEditor: (brickId?: string) => void
  closeFigEditor: () => void
  setCategory: (category: PartCategory) => void
  rotateCurrent: () => void
  /** Adds the current part (colour, rotation, figure look) at (x, y, z) and selects it. */
  place: (x: number, y: number, z: number) => void
  /** Selects brick `id` (no-op when there is no such brick). */
  select: (id: string) => void
  deselect: () => void
  /** Turns the selected brick a quarter turn (undoable; rejected when it would not fit). */
  rotateSelected: () => void
  /** Removes the selected brick (undoable) and clears the selection. */
  deleteSelected: () => void
  /** Copies the selected brick to the first free spot (see `duplicateSpot`) and selects the copy. */
  duplicateSelected: () => void
  /**
   * Recolours the selected brick (a figure: its torso, and the figure editor opens) and makes
   * `color` the colour for new bricks too, so the pressed swatch stays true after deselecting.
   */
  paintSelected: (color: number) => void
  /** Points the player at the colour column (the action bar's recolour button). */
  hintColors: () => void
  /** Moves brick `id` to `to` as one undo step and selects it (rejected when it does not fit there). */
  moveBrick: (id: string, to: Spot) => void
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

  /** The selected brick, when there is one. */
  const selected = (): Brick | undefined => {
    const id = get().selectedId
    return id === null ? undefined : workshop().bricks.find((b) => b.id === id)
  }

  /** Adds `brick` (undoable) and selects it. */
  const add = (brick: Brick) => {
    const bricks = workshop().bricks
    if (commit(bricks, addBrick(bricks, brick, workshop().baseplate), sfx.snap)) set({ selectedId: brick.id })
  }

  /** Makes `next` the current model, moving the camera along with its origin. */
  const restore = (next: Snapshot) => {
    useGame.getState().setWorkshop({ ...workshop(), bricks: next.bricks, baseplate: next.baseplate })
    const dx = origin.x - next.origin.x
    const dz = origin.z - next.origin.z
    origin = next.origin
    if (dx !== 0 || dz !== 0) set((s) => ({ viewShift: { seq: s.viewShift.seq + 1, dx, dz } }))
    // The selected brick may not exist in the restored model.
    set((s) => ({ lastError: null, selectedId: next.bricks.some((b) => b.id === s.selectedId) ? s.selectedId : null }))
  }

  const reset = () => {
    history.clear()
    origin = { x: 0, z: 0 }
    set((s) => ({ selectedId: null, lastError: null, canUndo: false, canRedo: false, frameSeq: s.frameSeq + 1, figEditor: null }))
  }

  return {
    partId: 'brick_2x4',
    color: DEFAULT_COLOR,
    fig: DEFAULT_FIG,
    rot: 0,
    category: 'brick',
    figEditor: null,
    lastError: null,
    errorSeq: 0,
    selectedId: null,
    colorHintSeq: 0,
    canUndo: false,
    canRedo: false,
    viewShift: { seq: 0, dx: 0, dz: 0 },
    frameSeq: 0,
    plateResize: false,

    setPlateResize: (on) => {
      if (get().plateResize !== on) set({ plateResize: on })
    },
    setPart: (partId) => set({ partId }),
    setColor: (color) => set({ color }),
    setFig: (fig) => set({ fig: { ...fig } }),
    restyleFigure: (id, fig) => {
      const bricks = workshop().bricks
      const target = bricks.find((b) => b.id === id)
      if (!target || !isFigure(target) || figKey(figOf(target)) === figKey(fig)) return
      commit(bricks, { bricks: restyleFigure(bricks, id, fig), error: null }, sfx.paint)
    },
    openFigEditor: (brickId) => set({ figEditor: { brickId: brickId ?? null } }),
    closeFigEditor: () => set({ figEditor: null }),
    setCategory: (category) => set({ category }),
    rotateCurrent: () => set((s) => ({ rot: nextRot(s.rot) })),

    place: (x, y, z) => {
      const { partId, color, rot, fig } = get()
      add(
        partId === MINIFIG_PART
          ? { id: newId(), p: partId, x, y, z, r: rot, c: fig.torso, fig: { ...fig } }
          : { id: newId(), p: partId, x, y, z, r: rot, c: color },
      )
    },

    select: (id) => {
      if (workshop().bricks.some((b) => b.id === id)) set({ selectedId: id })
    },
    deselect: () => set({ selectedId: null }),

    rotateSelected: () => {
      const target = selected()
      if (!target) return
      const { bricks, baseplate } = workshop()
      commit(bricks, rotateBrick(bricks, target.id, baseplate), sfx.snap)
    },

    deleteSelected: () => {
      const target = selected()
      if (!target) return
      const bricks = workshop().bricks
      commit(bricks, { bricks: removeBrick(bricks, target.id), error: null }, sfx.pop)
      set({ selectedId: null })
    },

    duplicateSelected: () => {
      const target = selected()
      if (!target) return
      const { bricks, baseplate } = workshop()
      const found = duplicateSpot(bricks, target, baseplate)
      if ('error' in found) {
        reject(found.error)
        return
      }
      add({ ...target, ...found.spot, id: newId(), ...(target.fig ? { fig: { ...target.fig } } : {}) })
    },

    paintSelected: (color) => {
      const target = selected()
      if (!target) return
      set({ color })
      const bricks = workshop().bricks
      if (isFigure(target)) {
        // Painting a figure recolours its torso, then shows it in the figure editor for more.
        if (figOf(target).torso !== figColor(color)) commit(bricks, { bricks: paintBrick(bricks, target.id, color), error: null }, sfx.paint)
        set({ figEditor: { brickId: target.id } })
        return
      }
      if (target.c === color) return // already this colour: nothing to undo
      commit(bricks, { bricks: paintBrick(bricks, target.id, color), error: null }, sfx.paint)
    },

    hintColors: () => set((s) => ({ colorHintSeq: s.colorHintSeq + 1 })),

    moveBrick: (id, to) => {
      const { bricks, baseplate } = workshop()
      const target = bricks.find((b) => b.id === id)
      if (!target) return
      if (target.x === to.x && target.y === to.y && target.z === to.z) {
        set({ selectedId: id })
        return
      }
      if (commit(bricks, moveBrick(bricks, id, to, baseplate), sfx.snap)) set({ selectedId: id })
    },

    resizePlate: (side, dir) => {
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
      const { baseplate, kind } = workshop()
      if (plateColor(baseplate, kind) === c) return
      history.push(snapshot())
      restore({ ...snapshot(), baseplate: { ...baseplate, c } })
      syncHistory()
      sfx.paint()
    },

    undo: () => {
      const prev = history.undo(snapshot())
      if (prev) restore(prev)
      syncHistory()
    },

    redo: () => {
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

/** True when the workshop model has any brick. */
export function workshopHasBricks(): boolean {
  return useGame.getState().data.workshop.bricks.length > 0
}

/** Reactive version of {@link workshopHasBricks}. */
export function useWorkshopHasBricks(): boolean {
  return useGame((s) => s.data.workshop.bricks.length > 0)
}
