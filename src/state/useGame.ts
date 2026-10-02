import { create } from 'zustand'
import * as cities from '../core/cities'
import { sameLayout, type Maze } from '../core/maze'
import { createEmptySave } from '../core/serialize'
import type { Blueprint, CityState, GuidedState, MazeChallenge, MazeRecord, SaveData, WorkshopState } from '../core/types'
import { notifyCityReplaced } from './cityReplaced'

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
  /** Also removes the placements that use this blueprint, in every city. */
  deleteBlueprint: (id: string) => void
  setWorkshop: (ws: WorkshopState) => void
  /** Stores `city` as the CURRENT city's content (see `currentCity`). */
  setCity: (city: CityState) => void
  /*
   * The kid's cities (core/cities). Every action that changes which city is current tells
   * `onCityReplaced` listeners (the City editor drops its undo history, the camera re-frames).
   */
  /** Adds a city and makes it current; its id, or null at the 20-city cap. */
  addCity: (city: CityState, name: string) => string | null
  /** Makes city `id` current; false when there is no such city. */
  switchCity: (id: string) => boolean
  renameCity: (id: string, name: string) => void
  /** Copies city `id` (named `name`) right after it, the current city staying current; the copy's id, or null at the cap. */
  duplicateCity: (id: string, name: string) => string | null
  /** Deletes city `id`; false for the last city (a slot always keeps one). */
  deleteCity: (id: string) => boolean
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

export const useGame = create<GameState>()((set, get) => {
  const update = (fn: (d: SaveData) => SaveData) => set((s) => ({ data: fn(s.data) }))
  /** Stores `next` (null: refused, nothing changes) and tells the listeners when the current city changed. */
  const applyCities = (next: SaveData | null): boolean => {
    if (!next) return false
    const before = get().data.currentCityId
    set({ data: next })
    if (next.currentCityId !== before) notifyCityReplaced()
    return true
  }
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
        cities: d.cities.map((c) =>
          c.city.placements.some((p) => p.source === id)
            ? { ...c, city: { ...c.city, placements: c.city.placements.filter((p) => p.source !== id) } }
            : c,
        ),
      })),
    setWorkshop: (workshop) => update((d) => ({ ...d, workshop })),
    setCity: (city) => update((d) => cities.setCurrentCity(d, city)),
    addCity: (city, name) => {
      const result = cities.addCity(get().data, city, name)
      return applyCities(result?.data ?? null) ? result!.id : null
    },
    switchCity: (id) => applyCities(cities.switchCity(get().data, id)),
    renameCity: (id, name) => void applyCities(cities.renameCity(get().data, id, name)),
    duplicateCity: (id, name) => {
      const result = cities.duplicateCity(get().data, id, name)
      return applyCities(result?.data ?? null) ? result!.id : null
    },
    deleteCity: (id) => applyCities(cities.deleteCity(get().data, id)),
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
