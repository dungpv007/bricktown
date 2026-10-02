import { describe, expect, it } from 'vitest'
import { sampleCity } from '../content/cities/sample'
import {
  FIRST_CITY_ID,
  MAX_CITIES,
  addCity,
  cityDisplayName,
  cityIsEmpty,
  currentCity,
  currentSavedCity,
  deleteCity,
  duplicateCity,
  emptyCity,
  renameCity,
  sanitizeCityName,
  setCurrentCity,
  switchCity,
} from './cities'
import { createEmptySave, exportSave, importSave, migrate } from './serialize'
import type { CityState, SaveData } from './types'

/** A v3 save (one `city` per slot) with a city using every layer: roads, rails, terrain, a scaled model. */
function v3Save(city: CityState): Record<string, unknown> {
  const { cities: _c, currentCityId: _id, ...rest } = createEmptySave()
  void _c
  void _id
  return { ...rest, schemaVersion: 3, city }
}

const RICH_CITY: CityState = {
  size: 40,
  roads: ['4,0', '4,1', '4,2'],
  placements: [
    { id: 'p1', source: 'tpl:house_small', cx: 6, cz: 6, rot: 1 },
    { id: 'p2', source: 'bp_mine', cx: 12, cz: 6, rot: 0, s: 3 },
  ],
  terrain: { water: ['20,20', '21,20'], pavement: ['0,0'], sand: ['1,0'] },
  rails: ['3,1', '4,1', '5,1'],
}

/** A save with cities named a, b, c (current: a). */
function threeCities(): SaveData {
  let data = createEmptySave()
  data = renameCity(data, FIRST_CITY_ID, 'a', 1)!
  data = addCity(data, { ...emptyCity(), roads: ['1,1'] }, 'b', 2)!.data
  data = addCity(data, { ...emptyCity(), roads: ['2,2'] }, 'c', 3)!.data
  return switchCity(data, FIRST_CITY_ID)!
}

const names = (d: SaveData) => d.cities.map((c) => c.name)

describe('save v3 -> v4 migration (many cities)', () => {
  it('a v3 save keeps its city intact as the first and current city', () => {
    const out = migrate(structuredClone(v3Save(RICH_CITY)))
    expect(out.schemaVersion).toBe(4)
    expect(out.cities).toEqual([
      { id: FIRST_CITY_ID, name: '', city: RICH_CITY, createdAt: 0, updatedAt: 0 },
    ])
    expect(out.currentCityId).toBe(FIRST_CITY_ID)
    expect(currentCity(out)).toEqual(RICH_CITY)
    expect(out).not.toHaveProperty('city')
  })

  it('a v3 export file imports the same way', () => {
    const file = JSON.stringify({ app: 'bricktown', ...v3Save(RICH_CITY) })
    expect(currentCity(importSave(file))).toEqual(RICH_CITY)
  })

  it('the sample town survives the migration unchanged', () => {
    const town = sampleCity()
    expect(currentCity(migrate(structuredClone(v3Save(town))))).toEqual(town)
  })

  it('a v3 save without a city object is still refused (backed up, never silently emptied)', () => {
    const { city: _c, ...noCity } = v3Save(RICH_CITY)
    void _c
    expect(() => migrate(noCity)).toThrow('unsupported save')
    expect(() => migrate({ ...noCity, city: 'x' })).toThrow('unsupported save')
  })

  it('round-trips several cities, their names and the current one', () => {
    let data = threeCities()
    data = setCurrentCity(data, RICH_CITY, 9)
    data = switchCity(data, data.cities[2].id)!
    expect(importSave(exportSave(data))).toEqual(data)
    expect(migrate(structuredClone(data))).toEqual(data)
  })
})

describe('normalize repairs cities without losing any', () => {
  const v4 = (cities: unknown, currentCityId?: unknown) => ({
    ...createEmptySave(),
    cities,
    currentCityId,
  })

  it('an empty list gets one empty city', () => {
    const out = migrate(v4([], 'gone'))
    expect(out.cities).toEqual(createEmptySave().cities)
    expect(out.currentCityId).toBe(FIRST_CITY_ID)
  })

  it('a dangling current id falls back to the first city', () => {
    const out = migrate(
      v4(
        [
          { id: 'x', city: {} },
          { id: 'y', city: {} },
        ],
        'gone',
      ),
    )
    expect(out.currentCityId).toBe('x')
    expect(
      migrate(
        v4(
          [
            { id: 'x', city: {} },
            { id: 'y', city: {} },
          ],
          'y',
        ),
      ).currentCityId,
    ).toBe('y')
    expect(migrate(v4([{ id: 'x', city: {} }])).currentCityId).toBe('x')
  })

  it('duplicate or missing ids get new ones, keeping every city and the first holder of an id current', () => {
    const out = migrate(
      v4(
        [
          { id: 'x', city: { roads: ['1,1'] } },
          { id: 'x', city: { roads: ['2,2'] } },
          { city: { roads: ['3,3'] } },
          { id: '', city: {} },
        ],
        'x',
      ),
    )
    expect(out.cities).toHaveLength(4)
    expect(new Set(out.cities.map((c) => c.id)).size).toBe(4)
    expect(out.cities[0].id).toBe('x')
    expect(out.cities.map((c) => c.city.roads)).toEqual([['1,1'], ['2,2'], ['3,3'], []])
    expect(out.currentCityId).toBe('x')
  })

  it('drops entries that are not cities, cleans names, defaults timestamps and normalises each city', () => {
    const out = migrate(
      v4([
        null,
        'city',
        { id: 'nocity', name: 'x' },
        {
          id: 'a',
          name: '  Phố\u0000 của‮ An  ',
          city: {
            size: 'big',
            roads: ['1,1', 7],
            placements: [],
            rails: ['3,3', '3,3'],
            terrain: { water: ['1,1', '9,9'] },
          },
          createdAt: 'yesterday',
          updatedAt: 5,
        },
        { id: 'b', name: 'x'.repeat(100), city: {} },
        { id: 'c', name: 42, city: {} },
      ]),
    )
    expect(out.cities.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(names(out)).toEqual(['Phố của An', 'x'.repeat(40), ''])
    expect(out.cities[0]).toMatchObject({ createdAt: 0, updatedAt: 5 })
    expect(out.cities[0].city).toEqual({
      size: 48,
      roads: ['1,1'],
      placements: [],
      rails: ['3,3'],
      terrain: { water: ['9,9'], pavement: [], sand: [] },
    })
  })

  it(`keeps at most ${MAX_CITIES} cities, always with the current one`, () => {
    const many = Array.from({ length: MAX_CITIES + 5 }, (_, i) => ({ id: `c${i}`, city: {} }))
    const first = migrate(v4(many, 'c3'))
    expect(first.cities.map((c) => c.id)).toEqual(many.slice(0, MAX_CITIES).map((c) => c.id))
    expect(first.currentCityId).toBe('c3')
    const late = migrate(v4(many, `c${MAX_CITIES + 2}`))
    expect(late.cities).toHaveLength(MAX_CITIES)
    expect(late.currentCityId).toBe(`c${MAX_CITIES + 2}`)
    expect(late.cities.at(-1)!.id).toBe(`c${MAX_CITIES + 2}`)
  })

  it('a v4 save without a cities list is refused', () => {
    const { cities: _c, ...rest } = createEmptySave()
    void _c
    expect(() => migrate(rest)).toThrow('unsupported save')
    expect(() => migrate({ ...rest, cities: {} })).toThrow('unsupported save')
  })
})

describe('city helpers', () => {
  it('currentCity follows currentCityId, and stays the same object while unchanged', () => {
    const data = threeCities()
    expect(currentCity(data)).toBe(data.cities[0].city)
    const b = switchCity(data, data.cities[1].id)!
    expect(currentCity(b).roads).toEqual(['1,1'])
    expect(currentSavedCity({ ...b, currentCityId: 'gone' })).toBe(b.cities[0])
  })

  it('setCurrentCity changes the current city only, bumping its updatedAt', () => {
    const data = threeCities()
    const id = data.cities[1].id
    const b = switchCity(data, id)!
    const out = setCurrentCity(b, RICH_CITY, 77)
    expect(out.cities[1]).toMatchObject({ id, city: RICH_CITY, updatedAt: 77 })
    expect(out.cities[0]).toBe(b.cities[0])
    expect(out.cities[2]).toBe(b.cities[2])
  })

  it('addCity appends a new current city with a fresh id and a clean name; refused at the cap', () => {
    let data = createEmptySave()
    const added = addCity(data, emptyCity(), '  Mới\u0007 ', 5)!
    expect(added.data.cities[1]).toEqual({
      id: added.id,
      name: 'Mới',
      city: emptyCity(),
      createdAt: 5,
      updatedAt: 5,
    })
    expect(added.data.currentCityId).toBe(added.id)
    expect(added.id).not.toBe(FIRST_CITY_ID)
    data = added.data
    while (data.cities.length < MAX_CITIES) data = addCity(data, emptyCity(), 'x')!.data
    expect(addCity(data, emptyCity(), 'one too many')).toBeNull()
  })

  it('switchCity refuses an unknown id and leaves the save as it is for the current one', () => {
    const data = threeCities()
    expect(switchCity(data, 'gone')).toBeNull()
    expect(switchCity(data, FIRST_CITY_ID)).toBe(data)
  })

  it('renameCity cleans the name; an empty name is the default one', () => {
    const data = threeCities()
    expect(names(renameCity(data, FIRST_CITY_ID, '  Biển\n xanh ', 4)!)).toEqual([
      'Biển xanh',
      'b',
      'c',
    ])
    expect(renameCity(data, FIRST_CITY_ID, '   ')!.cities[0].name).toBe('')
    expect(renameCity(data, 'gone', 'x')).toBeNull()
    expect(cityDisplayName({ name: '' }, 'Thành phố của bé')).toBe('Thành phố của bé')
    expect(cityDisplayName({ name: 'Phố' }, 'Thành phố của bé')).toBe('Phố')
    expect(sanitizeCityName('🏙️ Phố')).toBe('🏙️ Phố')
  })

  it('duplicateCity puts a deep copy right after the original, the current city staying current; refused at the cap', () => {
    let data = setCurrentCity(threeCities(), RICH_CITY)
    const copy = duplicateCity(data, FIRST_CITY_ID, 'a (copy)', 8)!
    expect(names(copy.data)).toEqual(['a', 'a (copy)', 'b', 'c'])
    expect(copy.data.cities[1]).toMatchObject({ id: copy.id, city: RICH_CITY, createdAt: 8 })
    expect(copy.data.cities[1].city).not.toBe(RICH_CITY)
    expect(copy.data.currentCityId).toBe(FIRST_CITY_ID)
    expect(duplicateCity(data, 'gone', 'x')).toBeNull()
    while (data.cities.length < MAX_CITIES) data = addCity(data, emptyCity(), 'x')!.data
    expect(duplicateCity(data, FIRST_CITY_ID, 'x')).toBeNull()
  })

  it('deleteCity never deletes the last city; deleting the current one makes its neighbour current', () => {
    const data = threeCities()
    const [a, b, c] = data.cities
    const noA = deleteCity(data, a.id)!
    expect(names(noA)).toEqual(['b', 'c'])
    expect(noA.currentCityId).toBe(b.id) // the next one
    const atEnd = deleteCity(switchCity(data, c.id)!, c.id)!
    expect(atEnd.currentCityId).toBe(b.id) // the one before, at the end
    const other = deleteCity(data, b.id)!
    expect(other.currentCityId).toBe(a.id) // not the current one: it stays
    expect(deleteCity(data, 'gone')).toBeNull()
    const one = deleteCity(deleteCity(data, a.id)!, b.id)!
    expect(one.cities).toHaveLength(1)
    expect(deleteCity(one, c.id)).toBeNull()
  })

  it('cityIsEmpty counts every layer: a city with only water and rails is not empty', () => {
    expect(cityIsEmpty(emptyCity())).toBe(true)
    expect(
      cityIsEmpty({ ...emptyCity(), rails: [], terrain: { water: [], pavement: [], sand: [] } }),
    ).toBe(true)
    expect(
      cityIsEmpty({
        ...emptyCity(),
        terrain: { water: ['1,1'], pavement: [], sand: [] },
        rails: ['3,3'],
      }),
    ).toBe(false)
    expect(
      cityIsEmpty({ ...emptyCity(), terrain: { water: ['1,1'], pavement: [], sand: [] } }),
    ).toBe(false)
    expect(cityIsEmpty({ ...emptyCity(), rails: ['3,3'] })).toBe(false)
    expect(
      cityIsEmpty({ ...emptyCity(), terrain: { water: [], pavement: [], sand: ['2,2'] } }),
    ).toBe(false)
    expect(
      cityIsEmpty({ ...emptyCity(), terrain: { water: [], pavement: ['2,2'], sand: [] } }),
    ).toBe(false)
    expect(cityIsEmpty({ ...emptyCity(), roads: ['0,0'] })).toBe(false)
    expect(cityIsEmpty(RICH_CITY)).toBe(false)
  })
})
