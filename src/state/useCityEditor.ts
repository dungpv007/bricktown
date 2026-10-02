import { create } from 'zustand'
import * as sfx from '../audio/sfx'
import {
  addPlacement,
  MAX_SCALE,
  MIN_SCALE,
  movePlacement,
  removePlacement,
  rotatePlacement,
  scaleOf,
  scalePlacement,
  type PlaceError,
} from '../core/city'
import { currentCity } from '../core/cities'
import { clampCell, duplicateCell, planPlacement, type Cell } from '../core/cityPlan'
import { newId } from '../core/ids'
import { eraseRails, eraseRoads, paintRails, paintRoads } from '../core/rails'
import { paintRoadLine } from '../core/roads'
import { paintTerrain, type TerrainBrush } from '../core/terrain'
import type { CityState } from '../core/types'
import { makeSizeOf, resolveRenderable } from '../render/sources'
import { onCityReplaced } from './cityReplaced'
import { createHistory } from './history'
import { useGame } from './useGame'

/** In road (or rail) mode one finger paints roads (rails), or erases them with the eraser. */
export type RoadTool = 'paint' | 'erase'

/** The painting tools: roads, rails and terrain (water, pavement, sand, grass). */
export type PaintLayer = 'road' | 'rail' | 'terrain'

/** Why a city action was refused: a placement error, or 'nothing' when there was nothing to act on. */
export type CityError = PlaceError | 'nothing'

export interface CityEditorState {
  /** The painting tool that is on, if any: one-finger drags paint with it instead of selecting / moving placements. */
  paintLayer: PaintLayer | null
  /**
   * A painting tool is on (`paintLayer !== null`; the name predates rails and terrain): one-finger
   * drags paint, selecting and moving placements is off.
   */
  roadMode: boolean
  /** Paint or erase, for the road and rail tools. */
  roadTool: RoadTool
  /** What the terrain tool paints (grass = erase). */
  terrainBrush: TerrainBrush
  /** Template (`tpl:<id>`) or blueprint id a tap on the empty ground quick-places (a Kho card). */
  selectedSource: string | null
  /** The selected placement: the action bar acts on it. */
  selectedPlacementId: string | null
  /** The Kho card being dragged onto the map, if any. */
  draggedSource: string | null
  lastError: CityError | null
  /** Incremented on every rejected action, so the UI can react to repeats of the same error. */
  errorSeq: number
  canUndo: boolean
  canRedo: boolean
  /** Road mode on or off (either way the selection is dropped); `setPaintLayer('road' | null)`. */
  setRoadMode: (on: boolean) => void
  /** Turns a painting tool on (null: off), with its eraser off; the selection is dropped. */
  setPaintLayer: (layer: PaintLayer | null) => void
  setRoadTool: (tool: RoadTool) => void
  setTerrainBrush: (brush: TerrainBrush) => void
  /** Picks the Kho card a tap on the ground quick-places; the same card again (or null) unpicks it. */
  selectSource: (source: string | null) => void
  selectPlacement: (id: string | null) => void
  setDraggedSource: (source: string | null) => void
  /** Paints an L-shaped road from one cell to another (both clamped into the grid). */
  paintRoad: (from: Cell, to: Cell) => void
  /** Removes the road cells `keys` (one undo step); rejected when none of them is a road. */
  eraseRoads: (keys: string[]) => void
  /** Paints an L-shaped railway from one cell to another; refused like roads (water, a bad level crossing). */
  paintRail: (from: Cell, to: Cell) => void
  /** Removes the rail cells `keys` (one undo step); rejected when none of them is a rail. */
  eraseRails: (keys: string[]) => void
  /** Paints the terrain brush on the cells `keys` (one undo step); rejected when nothing could change. */
  paintTerrain: (keys: string[]) => void
  /**
   * Tap on the empty ground at world point (x, z), in studs: quick-places the picked source there
   * (facing a road) and selects it, or deselects when no source is picked.
   */
  tapGround: (x: number, z: number) => void
  /**
   * Drops `source` (dragged out of the Kho) at world point (x, z) like a quick-place, and selects it.
   * Leaves road mode; a refused drop leaves nothing selected.
   */
  dropSource: (source: string, x: number, z: number) => void
  /** Moves a placement to min-corner cell (cx, cz); rejected (it stays) when it does not fit there. */
  movePlacement: (id: string, cx: number, cz: number) => void
  rotateSelected: () => void
  /**
   * Makes the selected model one size bigger (+1) or smaller (-1), x1..x10, growing in place (one
   * undo step). Refused (nothing changes) past x1 / x10, or when the bigger model does not fit.
   */
  scaleSelected: (delta: 1 | -1) => void
  /** Copies the selected placement (same size) next to it and selects the copy. */
  duplicateSelected: () => void
  deleteSelected: () => void
  undo: () => void
  redo: () => void
  /**
   * Forget undo history and selection, and drop a picked source that no longer exists (entering the
   * city, or another city became current).
   */
  reset: () => void
}

const history = createHistory<CityState>()

const game = () => useGame.getState()
/** The city being edited: always the current one (core/cities). */
const city = () => currentCity(game().data)
const sizeOf = () => makeSizeOf(game().data)
/** False once a blueprint was deleted (or another slot loaded) or it cannot be drawn. */
const canDraw = (source: string) => resolveRenderable(source, game().data) !== null

export const useCityEditor = create<CityEditorState>()((set, get) => {
  const reject = (error: CityError) => {
    sfx.error()
    set((s) => ({ lastError: error, errorSeq: s.errorSeq + 1 }))
  }

  const historyFlags = () => ({ canUndo: history.canUndo(), canRedo: history.canRedo() })

  /** Records `before` for undo and stores `after` (playing `sound`); a null `after` is a rejected action. */
  const commit = (before: CityState, after: CityState | null, error: CityError, sound: () => void): boolean => {
    if (after === null) {
      reject(error)
      return false
    }
    history.push(before)
    game().setCity(after)
    sound()
    set({ lastError: null, ...historyFlags() })
    return true
  }

  /** Adds a new placement of `source` where a tap / drop at (x, z) puts it, and selects it. */
  const placeAt = (source: string, x: number, z: number) => {
    if (!canDraw(source)) {
      // Never add a placement nothing could draw or tap: drop the stale pick instead.
      if (get().selectedSource === source) set({ selectedSource: null })
      reject('nothing')
      return
    }
    const before = city()
    const sizes = sizeOf()
    const plan = planPlacement(before, source, x, z, sizes)
    if (plan.error !== null) {
      reject(plan.error)
      return
    }
    const placement = { id: newId('pl'), source, cx: plan.cx, cz: plan.cz, rot: plan.rot }
    if (commit(before, addPlacement(before, placement, sizes), 'overlap', sfx.thunk)) set({ selectedPlacementId: placement.id })
  }

  /** The selected placement, if it still exists. */
  const selected = () => {
    const id = get().selectedPlacementId
    return id === null ? undefined : city().placements.find((p) => p.id === id)
  }

  /** Undo / redo: the selection stays on a placement that is still there (e.g. after a resize). */
  const restore = (snapshot: CityState | undefined) => {
    if (snapshot) game().setCity(snapshot)
    const id = get().selectedPlacementId
    const kept = id !== null && city().placements.some((p) => p.id === id)
    set({ lastError: null, selectedPlacementId: kept ? id : null, ...historyFlags() })
  }

  /** Commits a road / rail stroke result. */
  const commitPaint = (before: CityState, result: { city: CityState | null; error: CityError | null }) =>
    commit(before, result.city, result.error ?? 'overlap', sfx.snap)

  const offPaint = { paintLayer: null, roadMode: false, roadTool: 'paint' } as const

  return {
    paintLayer: null,
    roadMode: false,
    roadTool: 'paint',
    terrainBrush: 'water',
    selectedSource: null,
    selectedPlacementId: null,
    draggedSource: null,
    lastError: null,
    errorSeq: 0,
    canUndo: false,
    canRedo: false,

    setRoadMode: (on) => get().setPaintLayer(on ? 'road' : null),
    setPaintLayer: (layer) => set({ paintLayer: layer, roadMode: layer !== null, roadTool: 'paint', selectedPlacementId: null }),
    setRoadTool: (roadTool) => set({ roadTool }),
    setTerrainBrush: (terrainBrush) => set({ terrainBrush }),
    selectSource: (source) => set((s) => ({ selectedSource: source === s.selectedSource ? null : source })),
    selectPlacement: (id) => set({ selectedPlacementId: id }),
    setDraggedSource: (draggedSource) => set({ draggedSource }),

    paintRoad: (from, to) => {
      const before = city()
      const keys = paintRoadLine([], clampCell(from, before.size), clampCell(to, before.size))
      // Nothing changed (every cell a road already, under a building or water) or a bad level
      // crossing: refused, history kept clean.
      commitPaint(before, paintRoads(before, keys, sizeOf()))
    },

    eraseRoads: (keys) => {
      const before = city()
      commit(before, eraseRoads(before, keys), 'nothing', sfx.pop)
    },

    paintRail: (from, to) => {
      const before = city()
      const keys = paintRoadLine([], clampCell(from, before.size), clampCell(to, before.size))
      commitPaint(before, paintRails(before, keys, sizeOf()))
    },

    eraseRails: (keys) => {
      const before = city()
      commit(before, eraseRails(before, keys), 'nothing', sfx.pop)
    },

    paintTerrain: (keys) => {
      const before = city()
      const brush = get().terrainBrush
      // Water refused everywhere it was dragged (roads, rails, buildings): say why.
      commit(before, paintTerrain(before, keys, brush, sizeOf()), brush === 'water' ? 'water' : 'nothing', sfx.snap)
    },

    tapGround: (x, z) => {
      const { selectedSource } = get()
      set({ selectedPlacementId: null })
      if (selectedSource !== null) placeAt(selectedSource, x, z)
    },

    dropSource: (source, x, z) => {
      // Dropping a model is selection work: leave road mode. Nothing stays selected if the drop is
      // refused, so the refusal cannot shake some other building.
      set({ ...offPaint, selectedPlacementId: null })
      placeAt(source, x, z)
    },

    movePlacement: (id, cx, cz) => {
      const before = city()
      const p = before.placements.find((q) => q.id === id)
      if (!p) return
      set({ selectedPlacementId: id })
      if (p.cx === cx && p.cz === cz) return // put back where it was: nothing to undo
      commit(before, movePlacement(before, id, cx, cz, sizeOf()), 'overlap', sfx.thunk)
    },

    rotateSelected: () => {
      const p = selected()
      if (!p) return
      const before = city()
      commit(before, rotatePlacement(before, p.id, sizeOf()), 'overlap', sfx.snap)
    },

    scaleSelected: (delta) => {
      const p = selected()
      if (!p) return
      const s = scaleOf(p) + delta
      if (s < MIN_SCALE || s > MAX_SCALE) {
        reject('nothing') // already the smallest / biggest
        return
      }
      const before = city()
      const result = scalePlacement(before, p.id, s, sizeOf())
      commit(before, result.city, result.error ?? 'overlap', sfx.thunk)
    },

    duplicateSelected: () => {
      const p = selected()
      if (!p) return
      if (!canDraw(p.source)) {
        reject('nothing') // a grey placeholder: never copy something nothing can draw
        return
      }
      const before = city()
      const sizes = sizeOf()
      const cell = duplicateCell(before, p, sizes)
      const copy = cell && { ...p, id: newId('pl'), ...cell }
      if (commit(before, copy && addPlacement(before, copy, sizes), 'overlap', sfx.thunk) && copy) {
        set({ selectedPlacementId: copy.id })
      }
    },

    deleteSelected: () => {
      const p = selected()
      if (!p) return
      const before = city()
      if (commit(before, removePlacement(before, p.id), 'nothing', sfx.pop)) set({ selectedPlacementId: null })
    },

    undo: () => restore(history.undo(city())),
    redo: () => restore(history.redo(city())),

    reset: () => {
      history.clear()
      const { selectedSource } = get()
      set({
        lastError: null,
        ...offPaint,
        ...historyFlags(),
        selectedPlacementId: null,
        selectedSource: selectedSource !== null && canDraw(selectedSource) ? selectedSource : null,
      })
    },
  }
})

// Another city became current (a switch, a new city, an import): the undo history and selection are void.
onCityReplaced(() => useCityEditor.getState().reset())
