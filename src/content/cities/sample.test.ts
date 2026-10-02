import { describe, expect, it } from 'vitest'
import { canPlaceInCity, coveredCells } from '../../core/city'
import { buildNetwork } from '../../core/npc/network'
import { invalidCrossings, levelCrossings, railLines } from '../../core/rails'
import { exportSave, importSave, createEmptySave } from '../../core/serialize'
import { buildCityPackage, decodeShare, encodeShare } from '../../core/share'
import { makeSizeOf } from '../../render/sources'
import { getTemplate } from '../templates'
import { SAMPLE_CITY, SAMPLE_TEMPLATE_IDS, sampleCity } from './sample'

const sizeOf = makeSizeOf({ blueprints: [] })
const city = SAMPLE_CITY

describe('sample town', () => {
  it('uses only templates that exist', () => {
    for (const id of SAMPLE_TEMPLATE_IDS) expect(getTemplate(id), id).toBeDefined()
    for (const p of city.placements) {
      expect(p.source.startsWith('tpl:')).toBe(true)
      expect(getTemplate(p.source.slice(4)), p.source).toBeDefined()
    }
  })

  it('every placement is allowed where it stands (in bounds, no overlap, off roads, rails and water)', () => {
    for (const p of city.placements) expect(canPlaceInCity(city, p, sizeOf, p.id), `${p.source} at ${p.cx},${p.cz}`).toBeNull()
  })

  it('keeps roads and rails off the water, and every road/rail meeting is a valid level crossing', () => {
    const water = new Set(city.terrain?.water ?? [])
    for (const k of [...city.roads, ...(city.rails ?? [])]) expect(water.has(k), k).toBe(false)
    expect(invalidCrossings(city)).toEqual([])
    const crossings = levelCrossings(city)
    expect(crossings.length).toBeGreaterThanOrEqual(2)
    expect(crossings.length).toBeLessThanOrEqual(4)
  })

  it('has a railway loop for the train, a lake, pavement and a busy town', () => {
    const lines = railLines(city)
    expect(lines).toHaveLength(1)
    expect(lines[0].loop).toBe(true)
    expect(city.terrain!.water.length).toBeGreaterThan(20)
    expect(city.terrain!.sand.length).toBeGreaterThan(10)
    expect(city.terrain!.pavement.length).toBeGreaterThan(20)
    for (const id of ['sushi_restaurant', 'bakery', 'toy_shop', 'grocery', 'restaurant', 'fire_station', 'police_hq', 'office_tower', 'skyscraper', 'apartment', 'fountain', 'playground']) {
      expect(SAMPLE_TEMPLATE_IDS, id).toContain(id)
    }
    expect(city.placements.filter((p) => (p.s ?? 1) >= 2).length).toBeGreaterThanOrEqual(3) // downtown giants
    // Nothing stands on a cell it shares with another model (the overlap check above, seen as cells).
    expect(coveredCells(city, sizeOf).size).toBeGreaterThan(200)
  })

  it('gives the City life: cars, a train and people', () => {
    const net = buildNetwork(city, sizeOf)
    expect(net.carTarget).toBeGreaterThan(5)
    expect(net.trains).toHaveLength(1)
    expect(net.pedTarget).toBeGreaterThan(5)
  })

  it('survives a save round trip and a share link unchanged', () => {
    const save = { ...createEmptySave(), city: sampleCity() }
    expect(importSave(exportSave(save)).city).toEqual(save.city)
    const decoded = decodeShare(encodeShare(buildCityPackage(save.city, [], { name: 'x' })))
    expect('error' in decoded).toBe(false)
  })

  it('sampleCity() is a deep copy with fresh placement ids', () => {
    const a = sampleCity()
    const b = sampleCity()
    const withoutId = (p: (typeof city.placements)[number]) => ({ ...p, id: '' })
    expect(a.placements.map(withoutId)).toEqual(city.placements.map(withoutId))
    const ids = new Set([...a.placements, ...b.placements, ...city.placements].map((p) => p.id))
    expect(ids.size).toBe(city.placements.length * 3)
    a.roads.push('0,0')
    a.terrain!.water.push('0,0')
    a.rails!.push('0,0')
    a.placements[0].cx = 99
    expect(city.roads).not.toContain('0,0')
    expect(city.terrain!.water).not.toContain('0,0')
    expect(city.rails).not.toContain('0,0')
    expect(city.placements[0].cx).not.toBe(99)
  })
})
