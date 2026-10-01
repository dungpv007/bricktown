import { create } from 'zustand'
import { addPlacement, addRoads, removePlacement, rotatePlacement, type PlaceError } from '../core/city'
import { clampCell, planPlacement, pointToCell, removeRoad, type Cell } from '../core/cityPlan'
import { newId } from '../core/ids'
import { paintRoadLine } from '../core/roads'
import type { CityState } from '../core/types'
import { makeSizeOf } from '../render/sources'
import { createHistory } from './history'
import { useGame } from './useGame'

export type CityTool = 'road' | 'place' | 'erase' | 'rotate'

/** Why a city action was refused: a placement error, or 'nothing' when there was nothing to act on. */
export type CityError = PlaceError | 'nothing'

export interface CityEditorState {
  tool: CityTool
  /** Template (`tpl:<id>`) or blueprint id the place tool drops. */
  selectedSource: string | null
  /** Placement tapped with the place tool (its blueprint can be opened in the Workshop). */
  selectedPlacementId: string | null
  lastError: CityError | null
  /** Incremented on every rejected action, so the UI can react to repeats of the same error. */
  errorSeq: number
  canUndo: boolean
  setTool: (tool: CityTool) => void
  /** Picks what to place and switches to the place tool. */
  selectSource: (source: string) => void
  selectPlacement: (id: string | null) => void
  /** Road tool: paints an L-shaped road from one cell to another (both clamped into the grid). */
  paintRoad: (from: Cell, to: Cell) => void
  /** Tap on the ground at world point (x, z), in studs. */
  tapGround: (x: number, z: number) => void
  /** Tap on an existing placement. */
  tapPlacement: (id: string) => void
  undo: () => void
  /** Forget undo history and selection (entering the city, after loading another save). */
  reset: () => void
}

const history = createHistory<CityState>()

const game = () => useGame.getState()
const city = () => game().data.city
const sizeOf = () => makeSizeOf(game().data)

export const useCityEditor = create<CityEditorState>()((set, get) => {
  const reject = (error: CityError) => set((s) => ({ lastError: error, errorSeq: s.errorSeq + 1 }))

  /** Records `before` for undo and stores `after`; a null `after` is a rejected action. */
  const commit = (before: CityState, after: CityState | null, error: CityError): boolean => {
    if (after === null) {
      reject(error)
      return false
    }
    history.push(before)
    game().setCity(after)
    set({ lastError: null, canUndo: history.canUndo() })
    return true
  }

  return {
    tool: 'place',
    selectedSource: null,
    selectedPlacementId: null,
    lastError: null,
    errorSeq: 0,
    canUndo: false,

    setTool: (tool) => set({ tool, selectedPlacementId: null }),
    selectSource: (source) => set({ selectedSource: source, tool: 'place', selectedPlacementId: null }),
    selectPlacement: (id) => set({ selectedPlacementId: id }),

    paintRoad: (from, to) => {
      const before = city()
      const keys = paintRoadLine([], clampCell(from, before.size), clampCell(to, before.size))
      const after = addRoads(before, keys, sizeOf())
      // Every cell was already a road or under a building: nothing changed, keep history clean.
      const changed = after.roads.length !== before.roads.length
      commit(before, changed ? after : null, 'overlap')
    },

    tapGround: (x, z) => {
      const { tool, selectedSource } = get()
      const before = city()
      if (tool === 'place') {
        set({ selectedPlacementId: null })
        if (selectedSource === null) return
        const sizes = sizeOf()
        const plan = planPlacement(before, selectedSource, x, z, sizes)
        if (plan.error !== null) {
          reject(plan.error)
          return
        }
        const placement = { id: newId('pl'), source: selectedSource, cx: plan.cx, cz: plan.cz, rot: plan.rot }
        commit(before, addPlacement(before, placement, sizes), 'overlap')
      } else if (tool === 'erase') {
        const { cx, cz } = pointToCell(x, z)
        commit(before, removeRoad(before, cx, cz), 'nothing')
      } else if (tool === 'road') {
        const cell = pointToCell(x, z)
        get().paintRoad(cell, cell)
      }
      // rotate: tapping empty ground does nothing.
    },

    tapPlacement: (id) => {
      const before = city()
      if (!before.placements.some((p) => p.id === id)) return
      switch (get().tool) {
        case 'place':
          set({ selectedPlacementId: id })
          break
        case 'erase':
          commit(before, removePlacement(before, id), 'nothing')
          break
        case 'rotate':
          commit(before, rotatePlacement(before, id, sizeOf()), 'overlap')
          break
        case 'road':
          reject('overlap')
          break
      }
    },

    undo: () => {
      const prev = history.undo(city())
      if (prev) game().setCity(prev)
      set({ lastError: null, canUndo: history.canUndo(), selectedPlacementId: null })
    },

    reset: () => {
      history.clear()
      set({ lastError: null, canUndo: false, selectedPlacementId: null })
    },
  }
})
