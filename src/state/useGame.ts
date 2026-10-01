import { create } from 'zustand'
import type { Maze } from '../core/maze'
import { createEmptySave } from '../core/serialize'
import type { Blueprint, CityState, GuidedState, MazeRecord, SaveData, WorkshopState } from '../core/types'

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
  /** Adds the kid's maze, or replaces the one with the same id (keeping its place in the list). */
  upsertMaze: (maze: Maze) => void
  /** Also forgets the maze's best run and a friend's challenge on it. */
  deleteMaze: (id: string) => void
  /** Stores a run as the maze's record (`key`: maze id, or `tpl:<id>`); deciding what is "best" is the caller's job. */
  setMazeRecord: (key: string, record: MazeRecord) => void
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
    upsertMaze: (maze) =>
      update((d) => ({
        ...d,
        mazes: d.mazes.some((m) => m.id === maze.id) ? d.mazes.map((m) => (m.id === maze.id ? maze : m)) : [...d.mazes, maze],
      })),
    deleteMaze: (id) =>
      update((d) => {
        const { [id]: _record, ...mazeRecords } = d.mazeRecords
        const { [id]: _challenge, ...mazeChallenges } = d.mazeChallenges
        void _record
        void _challenge
        return { ...d, mazes: d.mazes.filter((m) => m.id !== id), mazeRecords, mazeChallenges }
      }),
    setMazeRecord: (key, record) => update((d) => ({ ...d, mazeRecords: { ...d.mazeRecords, [key]: record } })),
  }
})
