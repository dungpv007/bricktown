import { describe, expect, it } from 'vitest'
import { canPlaceInCity, scalePlacement, sourceSize, type SourceSize } from './city'
import { cellRuns, normalizeCellKeys, normalizeTerrain, paintTerrain, terrainAt, terrainLookup } from './terrain'
import type { CityPlacement, CityState } from './types'

const SIZES: Record<string, SourceSize> = {
  house: { w: 8, d: 8 }, // 1 x 1 cell
  big: { w: 16, d: 16 }, // 2 x 2 cells
  bridge: sourceSize({ w: 8, d: 24 }, ['water']), // 1 x 3 cells, a water model
}
const sizeOf = (s: string) => SIZES[s]
const city = (over: Partial<CityState> = {}): CityState => ({ size: 8, roads: [], placements: [], ...over })
const pl = (id: string, source: string, cx: number, cz: number, extra: Partial<CityPlacement> = {}): CityPlacement => ({
  id, source, cx, cz, rot: 0, ...extra,
})
const sorted = (keys: string[] | undefined) => [...(keys ?? [])].sort()

describe('paintTerrain', () => {
  it('paints each kind, a cell in one list only; grass erases and drops the field when all is grass', () => {
    let c = paintTerrain(city(), ['1,1', '2,1'], 'water', sizeOf)!
    expect(c.terrain).toEqual({ water: ['1,1', '2,1'], pavement: [], sand: [] })
    c = paintTerrain(c, ['2,1', '3,1'], 'sand', sizeOf)!
    expect(c.terrain).toEqual({ water: ['1,1'], pavement: [], sand: ['2,1', '3,1'] })
    c = paintTerrain(c, ['1,1'], 'pavement', sizeOf)!
    expect(terrainAt(c, 1, 1)).toBe('pavement')
    c = paintTerrain(c, ['1,1', '2,1', '3,1'], 'grass', sizeOf)!
    expect(c).toEqual(city())
    expect('terrain' in c).toBe(false)
  })

  it('is null when nothing changes (same kind again, off the grid, grass on grass)', () => {
    const c = paintTerrain(city(), ['1,1'], 'water', sizeOf)!
    expect(paintTerrain(c, ['1,1'], 'water', sizeOf)).toBeNull()
    expect(paintTerrain(c, ['-1,0', '8,8', '1,x'], 'sand', sizeOf)).toBeNull()
    expect(paintTerrain(city(), ['3,3'], 'grass', sizeOf)).toBeNull()
  })

  it('puts no water under roads, rails or ordinary models (other cells of the stroke still paint)', () => {
    const c = city({ roads: ['0,0'], rails: ['1,0'], placements: [pl('h', 'big', 4, 4)] })
    const out = paintTerrain(c, ['0,0', '1,0', '4,4', '5,5', '2,0'], 'water', sizeOf)!
    expect(out.terrain?.water).toEqual(['2,0'])
    expect(paintTerrain(c, ['0,0', '1,0', '5,5'], 'water', sizeOf)).toBeNull()
    // Pavement and sand go anywhere.
    expect(sorted(paintTerrain(c, ['0,0', '1,0', '4,4'], 'pavement', sizeOf)!.terrain?.pavement)).toEqual(['0,0', '1,0', '4,4'])
  })

  it('lets water under a water model, but never takes away its last water cell', () => {
    const lake = { water: ['3,2', '3,3'], pavement: [], sand: [] }
    const c = city({ terrain: lake, placements: [pl('b', 'bridge', 3, 1)] }) // covers 3,1..3,3
    expect(paintTerrain(c, ['3,1'], 'water', sizeOf)!.terrain?.water).toEqual(['3,2', '3,3', '3,1'])
    const one = paintTerrain(c, ['3,2', '3,3'], 'grass', sizeOf)!
    expect(one.terrain?.water).toEqual(['3,3']) // the second cell is the bridge's last water: kept
    expect(paintTerrain(one, ['3,3'], 'sand', sizeOf)).toBeNull()
  })

  it('looks terrain up fast and the same as terrainAt', () => {
    const c = city({ terrain: { water: ['1,1'], pavement: ['2,2'], sand: ['3,3'] } })
    const at = terrainLookup(c)
    for (const [x, z] of [[1, 1], [2, 2], [3, 3], [4, 4]]) expect(at(x, z)).toBe(terrainAt(c, x, z))
    expect([at(1, 1), at(2, 2), at(3, 3), at(4, 4)]).toEqual(['water', 'pavement', 'sand', 'grass'])
    expect(terrainLookup(city())(0, 0)).toBe('grass')
  })
})

describe('placement rules with water', () => {
  const lake = { water: ['2,2', '3,2', '2,3', '3,3'], pavement: ['0,0'], sand: ['1,0'] }
  const c = city({ terrain: lake })
  it('keeps ordinary models off water, also when scaled; pavement and sand take them', () => {
    expect(canPlaceInCity(c, pl('h', 'house', 2, 2), sizeOf)).toBe('water')
    expect(canPlaceInCity(c, pl('h', 'house', 0, 0), sizeOf)).toBeNull()
    expect(canPlaceInCity(c, pl('h', 'house', 1, 0), sizeOf)).toBeNull()
    expect(canPlaceInCity(c, pl('h', 'house', 0, 1), sizeOf)).toBeNull()
    // x2 from 0,1 covers 0..1 x 1..2 (dry); x3 covers 0..2 x 1..3, reaching the lake at 2,2.
    expect(canPlaceInCity(c, pl('h', 'house', 0, 1, { s: 2 }), sizeOf)).toBeNull()
    expect(canPlaceInCity(c, pl('h', 'house', 0, 1, { s: 3 }), sizeOf)).toBe('water')
    const grown = scalePlacement(city({ terrain: lake, placements: [pl('h', 'house', 1, 1)] }), 'h', 2, sizeOf)
    expect(grown.error).toBe('water')
  })
  it('puts water models on water or straddling water and land, never on dry land only', () => {
    expect(canPlaceInCity(c, pl('b', 'bridge', 2, 2), sizeOf)).toBeNull() // 2,2..2,4: straddles
    expect(canPlaceInCity(c, pl('b', 'bridge', 5, 0), sizeOf)).toBe('water')
    expect(canPlaceInCity(c, pl('b', 'bridge', 5, 0, { s: 2 }), sizeOf)).toBe('water')
    expect(canPlaceInCity(c, pl('b', 'bridge', 3, 0, { rot: 1 }), sizeOf)).toBe('water') // 3..5,0: dry
    expect(canPlaceInCity(c, pl('b', 'bridge', 1, 2, { rot: 1 }), sizeOf)).toBeNull() // 1..3,2: two cells wet
  })
})

describe('normalizeTerrain / normalizeCellKeys', () => {
  it('keeps valid in-grid keys once, in canonical spelling', () => {
    expect(normalizeCellKeys(['1,2', '1,2', '01,2', '8,0', '-1,0', '1.5,2', 'x', 3, null, '2,7'], 8)).toEqual(['1,2', '2,7'])
    expect(normalizeCellKeys('nope', 8)).toEqual([])
  })
  it('gives each cell one kind (water, then pavement, then sand) and no water under roads or rails', () => {
    const t = normalizeTerrain({ water: ['1,1', '2,2', '9,9'], pavement: ['1,1', '3,3'], sand: ['3,3', '4,4'], junk: ['5,5'] }, 8, new Set(['2,2']))
    expect(t).toEqual({ water: ['1,1'], pavement: ['3,3'], sand: ['4,4'] })
    expect(normalizeTerrain({ water: 'x', pavement: [7] }, 8, new Set())).toBeUndefined()
    expect(normalizeTerrain([['1,1']], 8, new Set())).toBeUndefined()
    expect(normalizeTerrain(null, 8, new Set())).toBeUndefined()
  })
})

describe('cellRuns', () => {
  it('groups cells into horizontal runs, row by row', () => {
    expect(cellRuns(['3,1', '1,1', '2,1', '5,1', '0,2', '2,1'])).toEqual([
      { cz: 1, cx0: 1, cx1: 4 },
      { cz: 1, cx0: 5, cx1: 6 },
      { cz: 2, cx0: 0, cx1: 1 },
    ])
  })
})
