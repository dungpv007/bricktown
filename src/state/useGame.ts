import { create } from 'zustand'
import { createEmptySave } from '../core/serialize'
import type { Blueprint, CityState, GuidedState, SaveData, WorkshopState } from '../core/types'

export interface GameState {
  data: SaveData
  loaded: boolean
  setData: (data: SaveData) => void
  update: (fn: (d: SaveData) => SaveData) => void
  upsertBlueprint: (bp: Blueprint) => void
  /** Also removes city placements that use this blueprint. */
  deleteBlueprint: (id: string) => void
  setWorkshop: (ws: WorkshopState) => void
  setCity: (city: CityState) => void
  setGuided: (g: GuidedState | null) => void
  markTemplateCompleted: (id: string) => void
}

export const useGame = create<GameState>()((set) => {
  const update = (fn: (d: SaveData) => SaveData) => set((s) => ({ data: fn(s.data) }))
  return {
    data: createEmptySave(),
    loaded: false,
    setData: (data) => set({ data, loaded: true }),
    update,
    upsertBlueprint: (bp) =>
      update((d) => ({
        ...d,
        blueprints: d.blueprints.some((b) => b.id === bp.id)
          ? d.blueprints.map((b) => (b.id === bp.id ? bp : b))
          : [...d.blueprints, bp],
      })),
    deleteBlueprint: (id) =>
      update((d) => ({
        ...d,
        blueprints: d.blueprints.filter((b) => b.id !== id),
        city: { ...d.city, placements: d.city.placements.filter((p) => p.source !== id) },
      })),
    setWorkshop: (workshop) => update((d) => ({ ...d, workshop })),
    setCity: (city) => update((d) => ({ ...d, city })),
    setGuided: (guided) => update((d) => ({ ...d, guided })),
    markTemplateCompleted: (id) =>
      update((d) =>
        d.completedTemplates.includes(id) ? d : { ...d, completedTemplates: [...d.completedTemplates, id] },
      ),
  }
})
