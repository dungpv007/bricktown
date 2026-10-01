import { describe, expect, it } from 'vitest'
import {
  CELL,
  addPlacement,
  addRoads,
  canPlaceInCity,
  footprintCells,
  movePlacement,
  removePlacement,
  rotatePlacement,
} from './city'
import type { Baseplate, CityPlacement, CityState } from './types'

const SIZES: Record<string, Baseplate> = {
  small: { w: 16, d: 16 },
  wide: { w: 8, d: 16 },
  odd: { w: 10, d: 9 },
}
const sizeOf = (source: string): Baseplate => SIZES[source]

const emptyCity = (size = 6): CityState => ({ size, roads: [], placements: [] })
const place = (id: string, source: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3 = 0): CityPlacement => ({
  id,
  source,
  cx,
  cz,
  rot,
})

describe('footprintCells', () => {
  it('uses 8 studs per cell', () => {
    expect(CELL).toBe(8)
  })
  it('16x16 -> 2x2', () => {
    expect(footprintCells({ w: 16, d: 16 }, 0)).toEqual({ cw: 2, cd: 2 })
  })
  it('8x16 rot 0 -> 1x2 and rot 1 -> 2x1', () => {
    expect(footprintCells({ w: 8, d: 16 }, 0)).toEqual({ cw: 1, cd: 2 })
    expect(footprintCells({ w: 8, d: 16 }, 1)).toEqual({ cw: 2, cd: 1 })
    expect(footprintCells({ w: 8, d: 16 }, 2)).toEqual({ cw: 1, cd: 2 })
    expect(footprintCells({ w: 8, d: 16 }, 3)).toEqual({ cw: 2, cd: 1 })
  })
  it('rounds partial cells up', () => {
    expect(footprintCells({ w: 10, d: 9 }, 0)).toEqual({ cw: 2, cd: 2 })
    expect(footprintCells({ w: 17, d: 1 }, 0)).toEqual({ cw: 3, cd: 1 })
  })
})

describe('canPlaceInCity', () => {
  it('accepts a placement fully inside an empty grid', () => {
    expect(canPlaceInCity(emptyCity(), place('a', 'small', 4, 4), sizeOf)).toBeNull()
    expect(canPlaceInCity(emptyCity(), place('a', 'small', 0, 0), sizeOf)).toBeNull()
  })

  it('rejects out of bounds on every side', () => {
    const c = emptyCity()
    expect(canPlaceInCity(c, place('a', 'small', 5, 0), sizeOf)).toBe('out_of_bounds')
    expect(canPlaceInCity(c, place('a', 'small', 0, 5), sizeOf)).toBe('out_of_bounds')
    expect(canPlaceInCity(c, place('a', 'small', -1, 0), sizeOf)).toBe('out_of_bounds')
    expect(canPlaceInCity(c, place('a', 'small', 0, -1), sizeOf)).toBe('out_of_bounds')
  })

  it('uses the rotated footprint for bounds', () => {
    const c = emptyCity()
    // wide is 1x2 at rot 0 (fits at cx 5), 2x1 at rot 1 (does not)
    expect(canPlaceInCity(c, place('a', 'wide', 5, 0, 0), sizeOf)).toBeNull()
    expect(canPlaceInCity(c, place('a', 'wide', 5, 0, 1), sizeOf)).toBe('out_of_bounds')
  })

  it('rejects overlap with other placements, accepts touching edges', () => {
    const c: CityState = { ...emptyCity(), placements: [place('a', 'small', 0, 0)] }
    expect(canPlaceInCity(c, place('b', 'small', 1, 1), sizeOf)).toBe('overlap')
    expect(canPlaceInCity(c, place('b', 'small', 2, 0), sizeOf)).toBeNull()
    expect(canPlaceInCity(c, place('b', 'small', 0, 2), sizeOf)).toBeNull()
  })

  it('ignores the placement named by ignoreId', () => {
    const a = place('a', 'small', 0, 0)
    const c: CityState = { ...emptyCity(), placements: [a] }
    expect(canPlaceInCity(c, place('a', 'small', 1, 1), sizeOf)).toBe('overlap')
    expect(canPlaceInCity(c, place('a', 'small', 1, 1), sizeOf, 'a')).toBeNull()
  })

  it('rejects placements covering road cells', () => {
    const c: CityState = { ...emptyCity(), roads: ['3,3'] }
    expect(canPlaceInCity(c, place('a', 'small', 2, 2), sizeOf)).toBe('road')
    expect(canPlaceInCity(c, place('a', 'small', 4, 4), sizeOf)).toBeNull()
  })

  it('reports out_of_bounds before overlap', () => {
    const c: CityState = { ...emptyCity(), placements: [place('a', 'small', 4, 4)] }
    expect(canPlaceInCity(c, place('b', 'small', 5, 5), sizeOf)).toBe('out_of_bounds')
  })
})

describe('placement operations', () => {
  it('addPlacement returns a new city and does not mutate', () => {
    const c = emptyCity()
    const p = place('a', 'small', 1, 1)
    const next = addPlacement(c, p, sizeOf)
    expect(next).not.toBe(c)
    expect(next?.placements).toEqual([p])
    expect(c.placements).toEqual([])
  })

  it('addPlacement returns null when invalid', () => {
    const c: CityState = { ...emptyCity(), placements: [place('a', 'small', 0, 0)] }
    expect(addPlacement(c, place('b', 'small', 1, 0), sizeOf)).toBeNull()
  })

  it('removePlacement removes by id without mutating', () => {
    const c: CityState = {
      ...emptyCity(),
      placements: [place('a', 'small', 0, 0), place('b', 'small', 2, 2)],
    }
    const next = removePlacement(c, 'a')
    expect(next.placements.map((p) => p.id)).toEqual(['b'])
    expect(c.placements).toHaveLength(2)
  })

  it('movePlacement moves when valid (ignoring itself)', () => {
    const c: CityState = { ...emptyCity(), placements: [place('a', 'small', 0, 0)] }
    const next = movePlacement(c, 'a', 1, 1, sizeOf)
    expect(next?.placements[0]).toEqual(place('a', 'small', 1, 1))
    expect(c.placements[0].cx).toBe(0)
  })

  it('movePlacement returns null when blocked, out of bounds or unknown', () => {
    const c: CityState = {
      ...emptyCity(),
      placements: [place('a', 'small', 0, 0), place('b', 'small', 2, 0)],
    }
    expect(movePlacement(c, 'a', 1, 0, sizeOf)).toBeNull()
    expect(movePlacement(c, 'a', 5, 5, sizeOf)).toBeNull()
    expect(movePlacement(c, 'zzz', 0, 4, sizeOf)).toBeNull()
  })

  it('rotatePlacement advances rot by one quarter turn when valid', () => {
    const c: CityState = { ...emptyCity(), placements: [place('a', 'wide', 0, 0, 0)] }
    const next = rotatePlacement(c, 'a', sizeOf)
    expect(next?.placements[0].rot).toBe(1)
    expect(c.placements[0].rot).toBe(0)
    const wrapped = rotatePlacement(
      { ...emptyCity(), placements: [place('a', 'wide', 0, 0, 3)] },
      'a',
      sizeOf,
    )
    expect(wrapped?.placements[0].rot).toBe(0)
  })

  it('rotatePlacement returns null when the rotated footprint does not fit', () => {
    const atEdge: CityState = { ...emptyCity(), placements: [place('a', 'wide', 5, 0, 0)] }
    expect(rotatePlacement(atEdge, 'a', sizeOf)).toBeNull()
    const blocked: CityState = {
      ...emptyCity(),
      placements: [place('a', 'wide', 0, 0, 0), place('b', 'small', 1, 0)],
    }
    expect(rotatePlacement(blocked, 'a', sizeOf)).toBeNull()
    expect(rotatePlacement(blocked, 'zzz', sizeOf)).toBeNull()
  })
})

describe('addRoads', () => {
  it('adds new road keys deduplicated, without mutating', () => {
    const c: CityState = { ...emptyCity(), roads: ['0,0'] }
    const next = addRoads(c, ['0,0', '1,0', '1,0'], sizeOf)
    expect(next.roads.slice().sort()).toEqual(['0,0', '1,0'])
    expect(c.roads).toEqual(['0,0'])
  })

  it('rejects cells covered by placements', () => {
    const c: CityState = { ...emptyCity(), placements: [place('a', 'small', 1, 1)] }
    const next = addRoads(c, ['0,0', '1,1', '2,2', '3,3'], sizeOf)
    expect(next.roads).toEqual(['0,0', '3,3'])
  })

  it('rejects cells outside the grid', () => {
    const next = addRoads(emptyCity(), ['0,0', '6,0', '-1,2', '0,6'], sizeOf)
    expect(next.roads).toEqual(['0,0'])
  })
})
