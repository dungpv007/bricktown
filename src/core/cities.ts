import { newId } from './ids'
import { sanitizeName } from './names'
import type { CityState, SavedCity, SaveData } from './types'

/**
 * The kid's many cities in one save slot: pure helpers over `SaveData.cities` / `currentCityId`.
 * The City editor and Drive always work on the current city (`currentCity`); the picker makes,
 * copies, renames, deletes and switches cities. Each helper returns a new save (or null when it
 * was refused) and never touches the other cities.
 */

/** Most cities one save slot keeps (each can be a whole sample town: storage and the picker stay small). */
export const MAX_CITIES = 20

/** Id of the first city of a new save (and of a v3 save's only city): stable, so tests and fixtures can name it. */
export const FIRST_CITY_ID = 'city_1'

/** Size (cells per side) of a new empty city: the size the City always had. */
export const DEFAULT_CITY_SIZE = 48

export const emptyCity = (size = DEFAULT_CITY_SIZE): CityState => ({
  size,
  roads: [],
  placements: [],
})

/** A city name as the kid typed it, made safe: no control or hiding characters, trimmed, at most 40 characters. */
export const sanitizeCityName = (v: unknown): string => sanitizeName(v, '')

/** The current city's record; the first city when the id dangles (never after `migrate`). */
export function currentSavedCity(data: Pick<SaveData, 'cities' | 'currentCityId'>): SavedCity {
  return data.cities.find((c) => c.id === data.currentCityId) ?? data.cities[0]
}

/** The city the City editor and Drive use. Same object while it is unchanged (safe as a store selector). */
export const currentCity = (data: Pick<SaveData, 'cities' | 'currentCityId'>): CityState =>
  currentSavedCity(data).city

/**
 * True when nothing was made in `city`: no placement, road, rail, water, pavement or sand. Anything
 * that would replace a city's contents must ask first unless this holds (a lake alone is the kid's
 * work too); an empty city has nothing to share.
 */
export function cityIsEmpty(city: CityState): boolean {
  const t = city.terrain
  return (
    city.placements.length === 0 &&
    city.roads.length === 0 &&
    !city.rails?.length &&
    !t?.water.length &&
    !t?.pavement.length &&
    !t?.sand.length
  )
}

/** The name to show: the kid's own, or `fallback` (the default name in the kid's language) when it is empty. */
export const cityDisplayName = (c: Pick<SavedCity, 'name'>, fallback: string): string =>
  c.name || fallback

/** A city id no city of `data` has. */
function freshCityId(data: Pick<SaveData, 'cities'>): string {
  const taken = new Set(data.cities.map((c) => c.id))
  let id = newId('city')
  while (taken.has(id)) id = newId('city')
  return id
}

/** The save with the city `id` replaced by `fn` of it (and its `updatedAt` bumped). */
function withCity(data: SaveData, id: string, fn: (c: SavedCity) => SavedCity): SaveData {
  return { ...data, cities: data.cities.map((c) => (c.id === id ? fn(c) : c)) }
}

/** Stores `city` as the current city's content. */
export function setCurrentCity(data: SaveData, city: CityState, now = Date.now()): SaveData {
  const { id } = currentSavedCity(data)
  return withCity(data, id, (c) => ({ ...c, city, updatedAt: now }))
}

export type AddCityResult = { data: SaveData; id: string } | null

/** Adds a city (named `name`, cleaned) after the others and makes it current; null at `MAX_CITIES`. */
export function addCity(
  data: SaveData,
  city: CityState,
  name: string,
  now = Date.now(),
): AddCityResult {
  if (data.cities.length >= MAX_CITIES) return null
  const id = freshCityId(data)
  const saved: SavedCity = {
    id,
    name: sanitizeCityName(name),
    city,
    createdAt: now,
    updatedAt: now,
  }
  return { data: { ...data, cities: [...data.cities, saved], currentCityId: id }, id }
}

/** Makes city `id` the current one; null when there is no such city. */
export function switchCity(data: SaveData, id: string): SaveData | null {
  if (!data.cities.some((c) => c.id === id)) return null
  return data.currentCityId === id ? data : { ...data, currentCityId: id }
}

/** Renames city `id` (the name is cleaned; empty = the default name); null when there is no such city. */
export function renameCity(
  data: SaveData,
  id: string,
  name: string,
  now = Date.now(),
): SaveData | null {
  if (!data.cities.some((c) => c.id === id)) return null
  return withCity(data, id, (c) => ({ ...c, name: sanitizeCityName(name), updatedAt: now }))
}

/**
 * Copies city `id` (named `name`) right after it; null at `MAX_CITIES` or when there is no such
 * city. The current city stays current (a copy is a backup or a variant to open later). Placements
 * keep their ids: ids only need to be unique inside a city.
 */
export function duplicateCity(
  data: SaveData,
  id: string,
  name: string,
  now = Date.now(),
): AddCityResult {
  const at = data.cities.findIndex((c) => c.id === id)
  if (at < 0 || data.cities.length >= MAX_CITIES) return null
  const copyId = freshCityId(data)
  const copy: SavedCity = {
    id: copyId,
    name: sanitizeCityName(name),
    city: structuredClone(data.cities[at].city),
    createdAt: now,
    updatedAt: now,
  }
  const cities = [...data.cities.slice(0, at + 1), copy, ...data.cities.slice(at + 1)]
  return { data: { ...data, cities }, id: copyId }
}

/**
 * Deletes city `id`; null for the last city (a slot always has one) or an unknown id. Deleting the
 * current city makes its neighbour current (the next one, or the one before at the end).
 */
export function deleteCity(data: SaveData, id: string): SaveData | null {
  const at = data.cities.findIndex((c) => c.id === id)
  if (at < 0 || data.cities.length <= 1) return null
  const cities = data.cities.filter((c) => c.id !== id)
  const currentCityId =
    data.currentCityId === id ? cities[Math.min(at, cities.length - 1)].id : data.currentCityId
  return { ...data, cities, currentCityId }
}
