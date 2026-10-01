import { describe, expect, it } from 'vitest'
import { CELL } from './city'
import {
  clampCell,
  footprintOrigin,
  frontRoadCount,
  placementCenter,
  planPlacement,
  planMove,
  pointToCell,
  removeRoads,
  duplicateCell,
} from './cityPlan'
import type { Baseplate, CityPlacement, CityState } from './types'

const SIZES: Record<string, Baseplate> = {
  house: { w: 16, d: 16 },
  big: { w: 32, d: 32 },
  car: { w: 8, d: 16 },
}
const sizeOf = (source: string): Baseplate => SIZES[source]
const city = (roads: string[] = [], size = 10): CityState => ({ size, roads, placements: [] })

describe('pointToCell / clampCell', () => {
  it('maps world studs to the cell containing them', () => {
    expect(pointToCell(0, 0)).toEqual({ cx: 0, cz: 0 })
    expect(pointToCell(7.99, 8)).toEqual({ cx: 0, cz: 1 })
    expect(pointToCell(-0.1, 20)).toEqual({ cx: -1, cz: 2 })
  })
  it('clamps a cell into the grid', () => {
    expect(clampCell({ cx: -3, cz: 12 }, 10)).toEqual({ cx: 0, cz: 9 })
    expect(clampCell({ cx: 4, cz: 5 }, 10)).toEqual({ cx: 4, cz: 5 })
  })
})

describe('footprintOrigin', () => {
  it('puts a 1x1 footprint on the cell under the point', () => {
    expect(footprintOrigin(3 * CELL + 1, 5 * CELL + 7, 1, 1)).toEqual({ cx: 3, cz: 5 })
  })
  it('centres a larger footprint on the point', () => {
    // 4x4 footprint centred near x = 10.5 cells -> cells 9..12 (centre 11) is within half a cell.
    expect(footprintOrigin(10.5 * CELL, 10.5 * CELL, 4, 4)).toEqual({ cx: 9, cz: 9 })
    expect(footprintOrigin(10.2 * CELL, 10.2 * CELL, 2, 2)).toEqual({ cx: 9, cz: 9 })
    expect(footprintOrigin(10.6 * CELL, 10.6 * CELL, 2, 2)).toEqual({ cx: 10, cz: 10 })
  })
})

describe('frontRoadCount', () => {
  // 2x2 footprint at (4,4): the front row for rot 0 is z = 3, rot 1 x = 3, rot 2 z = 6, rot 3 x = 6.
  const roads = new Set(['4,3', '5,3', '6,4'])
  it('counts road cells along the side the model faces', () => {
    expect(frontRoadCount(roads, 4, 4, 2, 2, 0)).toBe(2)
    expect(frontRoadCount(roads, 4, 4, 2, 2, 1)).toBe(0)
    expect(frontRoadCount(roads, 4, 4, 2, 2, 2)).toBe(0)
    expect(frontRoadCount(roads, 4, 4, 2, 2, 3)).toBe(1)
  })
})

describe('planPlacement', () => {
  const at = (cx: number, cz: number) => [(cx + 0.5) * CELL, (cz + 0.5) * CELL] as const

  it('faces the front (-Z at rot 0) towards the adjacent road', () => {
    // Road row along z = 3; a house tapped just below it.
    const roads = ['3,3', '4,3', '5,3', '6,3']
    const [x, z] = [5 * CELL, 5 * CELL] // centre of a 2x2 at (4,4)
    expect(planPlacement(city(roads), 'house', x, z, sizeOf)).toEqual({ cx: 4, cz: 4, rot: 0, error: null })
    // Road row below instead (z = 6) -> turn around (rot 2).
    const below = ['3,6', '4,6', '5,6', '6,6']
    expect(planPlacement(city(below), 'house', x, z, sizeOf)).toEqual({ cx: 4, cz: 4, rot: 2, error: null })
    // Road column on the right (x = 6) -> front to +X (rot 3).
    const right = ['6,3', '6,4', '6,5', '6,6']
    expect(planPlacement(city(right), 'house', x, z, sizeOf)).toEqual({ cx: 4, cz: 4, rot: 3, error: null })
  })

  it('without a road nearby faces the camera side (+Z, rot 2)', () => {
    const [x, z] = at(5, 5)
    expect(planPlacement(city(), 'car', x, z, sizeOf).rot).toBe(2)
  })

  it('turns a long footprint to fit when the default rotation does not', () => {
    // 1x2 car between two road rows: standing up it would overlap a road, lying flat it fits.
    const roads = Array.from({ length: 10 }, (_, i) => [`${i},4`, `${i},6`]).flat()
    const [x, z] = at(5, 5)
    const plan = planPlacement(city(roads), 'car', x, z, sizeOf)
    expect(plan.error).toBeNull()
    expect(plan.rot % 2).toBe(1)
    expect(plan.cz).toBe(5)
  })

  it('slides the footprint inside the grid near the edges', () => {
    const [x, z] = at(9, 9)
    expect(planPlacement(city(), 'house', x, z, sizeOf)).toEqual({ cx: 8, cz: 8, rot: 2, error: null })
  })

  it('reports why nothing fits', () => {
    const [x, z] = at(0, 0)
    const blocked = city(['0,0', '1,0', '0,1', '1,1', '2,0', '2,1', '2,2', '0,2', '1,2'])
    expect(planPlacement(blocked, 'house', x, z, sizeOf).error).toBe('road')
    const tiny = city([], 3)
    expect(planPlacement(tiny, 'big', 1.5 * CELL, 1.5 * CELL, sizeOf).error).toBe('out_of_bounds')
  })
})

describe('placementCenter', () => {
  it('is the middle of the rotated footprint in world studs', () => {
    expect(placementCenter({ cx: 2, cz: 3, rot: 0 }, { w: 8, d: 16 })).toEqual({ x: 2.5 * CELL, z: 4 * CELL })
    expect(placementCenter({ cx: 2, cz: 3, rot: 1 }, { w: 8, d: 16 })).toEqual({ x: 3 * CELL, z: 3.5 * CELL })
  })
})

describe('removeRoads', () => {
  it('removes the listed road cells and returns null when none of them is a road', () => {
    const c = city(['1,1', '2,1', '3,1'])
    expect(removeRoads(c, ['1,1', '3,1', '9,9'])?.roads).toEqual(['2,1'])
    expect(removeRoads(c, ['5,5'])).toBeNull()
    expect(removeRoads(c, [])).toBeNull()
  })
})

const pl = (id: string, source: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3 = 0): CityPlacement => ({ id, source, cx, cz, rot })

describe('duplicateCell', () => {
  it('puts the copy right next to the original, trying +X first', () => {
    const a = pl('a', 'house', 4, 4)
    expect(duplicateCell({ size: 10, roads: [], placements: [a] }, a, sizeOf)).toEqual({ cx: 6, cz: 4 })
  })

  it('then tries -X, +Z and -Z', () => {
    const a = pl('a', 'house', 4, 4)
    const blockers = [pl('b', 'house', 6, 4)]
    const at = (placements: CityPlacement[], roads: string[] = []) =>
      duplicateCell({ size: 10, roads, placements: [a, ...placements] }, a, sizeOf)
    expect(at(blockers)).toEqual({ cx: 2, cz: 4 })
    expect(at([...blockers, pl('c', 'house', 2, 4)])).toEqual({ cx: 4, cz: 6 })
    expect(at([...blockers, pl('c', 'house', 2, 4)], ['4,6'])).toEqual({ cx: 4, cz: 2 })
  })

  it('uses the rotated footprint and stays inside the grid', () => {
    const car = pl('a', 'car', 9, 0, 1) // 8x16 turned: 2 cells along X, 1 along Z -> does not fit at +X
    expect(duplicateCell({ size: 11, roads: [], placements: [car] }, car, sizeOf)).toEqual({ cx: 7, cz: 0 })
  })

  it('falls back to the second ring (one footprint further, then the corners)', () => {
    const a = pl('a', 'house', 4, 4)
    const ring1 = [pl('b', 'house', 6, 4), pl('c', 'house', 2, 4), pl('d', 'house', 4, 6), pl('e', 'house', 4, 2)]
    expect(duplicateCell({ size: 10, roads: [], placements: [a, ...ring1] }, a, sizeOf)).toEqual({ cx: 8, cz: 4 })
    // A 6x6 grid: nothing two footprints away fits, the corner +X+Z does.
    const b = pl('a', 'house', 2, 2)
    const around = [pl('b', 'house', 4, 2), pl('c', 'house', 0, 2), pl('d', 'house', 2, 4), pl('e', 'house', 2, 0)]
    expect(duplicateCell({ size: 6, roads: [], placements: [b, ...around] }, b, sizeOf)).toEqual({ cx: 4, cz: 4 })
  })

  it('returns null when nothing nearby is free', () => {
    const a = pl('a', 'house', 0, 0)
    expect(duplicateCell({ size: 2, roads: [], placements: [a] }, a, sizeOf)).toBeNull()
  })
})

describe('planMove', () => {
  const a = pl('a', 'house', 1, 1, 1)
  it('centres the footprint on the point, keeping the rotation, ignoring the moved placement itself', () => {
    const c: CityState = { size: 10, roads: [], placements: [a] }
    expect(planMove(c, a, 2 * CELL, 2 * CELL, sizeOf)).toEqual({ cx: 1, cz: 1, rot: 1, error: null })
    expect(planMove(c, a, 6 * CELL, 5 * CELL, sizeOf)).toEqual({ cx: 5, cz: 4, rot: 1, error: null })
  })
  it('slides inside the grid and reports overlaps and roads', () => {
    const c: CityState = { size: 10, roads: ['8,1'], placements: [a, pl('b', 'house', 5, 5)] }
    expect(planMove(c, a, 100, -50, sizeOf)).toMatchObject({ cx: 8, cz: 0, error: 'road' })
    expect(planMove(c, a, 6 * CELL, 6 * CELL, sizeOf)).toMatchObject({ cx: 5, cz: 5, error: 'overlap' })
  })
})
