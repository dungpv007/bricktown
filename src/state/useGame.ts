import { create } from 'zustand'
import { sameLayout, type Maze } from '../core/maze'
import { createEmptySave } from '../core/serialize'
import type { Blueprint, CityState, GuidedState, MazeChallenge, MazeRecord, SaveData, WorkshopState } from '../core/types'

/** What a maze's layout earned: the kid's best run and a friend's time to beat. */
export interface MazeRuns {
  record?: MazeRecord
  challenge?: MazeChallenge
}

/** The best run and the challenge kept for maze `id`. */
export function mazeRunsOf(d: SaveData, id: string): MazeRuns {
  const record = d.mazeRecords[id]
  const challenge = d.mazeChallenges[id]
  return { ...(record ? { record } : {}), ...(challenge ? { challenge } : {}) }
}

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
  /**
   * Adds the kid's maze, or replaces the one with the same id (keeping its place in the list). A
   * replacement that changes the layout (walls, doors, coins, size: see `sameLayout`) also forgets
   * the maze's best run and a friend's challenge on it, which no longer match; a new name or
   * colour keeps them.
   */
  upsertMaze: (maze: Maze) => void
  /** Also forgets the maze's best run and a friend's challenge on it. */
  deleteMaze: (id: string) => void
  /** Stores a run as the maze's record (`key`: maze id, or `tpl:<id>`); deciding what is "best" is the caller's job. */
  setMazeRecord: (key: string, record: MazeRecord) => void
  /** Sets maze `id`'s best run and challenge to exactly `runs` (undo of an edit that forgot them). */
  restoreRuns: (id: string, runs: MazeRuns) => void
}

/** The save without the best run and the challenge kept for maze `id`. */
function forgetRuns(d: SaveData, id: string): SaveData {
  const { [id]: _record, ...mazeRecords } = d.mazeRecords
  const { [id]: _challenge, ...mazeChallenges } = d.mazeChallenges
  void _record
  void _challenge
  return { ...d, mazeRecords, mazeChallenges }
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
      update((d) => {
        const old = d.mazes.find((m) => m.id === maze.id)
        if (!old) return { ...d, mazes: [...d.mazes, maze] }
        const mazes = d.mazes.map((m) => (m.id === maze.id ? maze : m))
        return sameLayout(old, maze) ? { ...d, mazes } : { ...forgetRuns(d, maze.id), mazes }
      }),
    deleteMaze: (id) => update((d) => ({ ...forgetRuns(d, id), mazes: d.mazes.filter((m) => m.id !== id) })),
    setMazeRecord: (key, record) => update((d) => ({ ...d, mazeRecords: { ...d.mazeRecords, [key]: record } })),
    restoreRuns: (id, { record, challenge }) =>
      update((d) => {
        const rest = forgetRuns(d, id)
        return {
          ...rest,
          mazeRecords: record ? { ...rest.mazeRecords, [id]: record } : rest.mazeRecords,
          mazeChallenges: challenge ? { ...rest.mazeChallenges, [id]: challenge } : rest.mazeChallenges,
        }
      }),
  }
})
