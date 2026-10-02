import { describe, expect, it } from 'vitest'
import {
  AVENUE_LANE_STUDS,
  CELL,
  STREET_LANE_STUDS,
  addPlacement,
  addRoads,
  canPlaceInCity,
  footprintCells,
  movePlacement,
  normalizeScale,
  placementCells,
  removePlacement,
  rotatePlacement,
  scalePlacement,
  settleVehicle,
  type SourceSize,
} from './city'
import { duplicateCell, planMove, planPlacement } from './cityPlan'
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

describe('scaled placements', () => {
  const big = (id: string, source: string, cx: number, cz: number, s: number, rot: 0 | 1 | 2 | 3 = 0): CityPlacement => ({
    ...place(id, source, cx, cz, rot),
    s,
  })

  it('a scaled footprint is the plate studs x s, in cells, rotated', () => {
    expect(placementCells({ rot: 0 }, SIZES.odd)).toEqual({ cw: 2, cd: 2 }) // 10x9
    expect(placementCells({ rot: 0, s: 2 }, SIZES.odd)).toEqual({ cw: 3, cd: 3 }) // 20x18 studs
    expect(placementCells({ rot: 1, s: 3 }, SIZES.wide)).toEqual({ cw: 6, cd: 3 }) // 24x48 turned
    expect(placementCells({ rot: 0, s: 10 }, SIZES.small)).toEqual({ cw: 20, cd: 20 })
  })

  it('normalizeScale rounds and clamps into 1..10; anything else is 1', () => {
    expect([2.4, 2.5, 0, -1, 11, 10, 7].map(normalizeScale)).toEqual([2, 3, 1, 1, 10, 10, 7])
    expect([undefined, null, '3', NaN, Infinity].map(normalizeScale)).toEqual([1, 1, 1, 1, 1])
  })

  it('collides, leaves the city and meets roads with its scaled footprint', () => {
    const city: CityState = { size: 10, roads: ['7,1'], placements: [big('a', 'small', 0, 0, 2)] } // 4x4 cells
    expect(canPlaceInCity(city, place('b', 'small', 3, 3), sizeOf)).toBe('overlap')
    expect(canPlaceInCity(city, place('b', 'small', 4, 0), sizeOf)).toBeNull()
    expect(canPlaceInCity(city, big('b', 'small', 4, 0, 2), sizeOf)).toBe('road') // cells 4..7 x 0..3
    expect(canPlaceInCity(city, big('b', 'small', 4, 4, 4), sizeOf)).toBe('out_of_bounds') // 8x8 cells
    expect(addRoads(city, ['3,3', '4,4'], sizeOf).roads).toEqual(['7,1', '4,4'])
  })

  it('grows in place around its centre and shrinks back exactly (one undo-able step)', () => {
    const city: CityState = { ...emptyCity(20), placements: [place('a', 'small', 8, 8)] } // 2x2 cells 8..9
    const x2 = scalePlacement(city, 'a', 2, sizeOf).city!
    expect(x2.placements[0]).toEqual(big('a', 'small', 7, 7, 2)) // 4x4 cells 7..10: same centre
    const x3 = scalePlacement(x2, 'a', 3, sizeOf).city!
    expect(x3.placements[0]).toEqual(big('a', 'small', 6, 6, 3)) // 6x6 cells 6..11
    const back = scalePlacement(scalePlacement(x3, 'a', 2, sizeOf).city!, 'a', 1, sizeOf).city!
    expect(back.placements[0]).toEqual(place('a', 'small', 8, 8)) // x1 drops the field
    expect(scalePlacement(city, 'a', 25, sizeOf).city!.placements[0].s).toBe(10) // clamped
  })

  it('slides back inside the grid when growing at an edge', () => {
    const city: CityState = { ...emptyCity(20), placements: [place('a', 'small', 0, 18)] }
    expect(scalePlacement(city, 'a', 3, sizeOf).city!.placements[0]).toMatchObject({ cx: 0, cz: 14, s: 3 })
  })

  it('a scale-up that would cover another model, a road or not fit the city is refused, nothing changes', () => {
    const city: CityState = { size: 10, roads: ['0,9'], placements: [place('a', 'small', 4, 4), place('b', 'small', 6, 4)] }
    expect(scalePlacement(city, 'a', 2, sizeOf)).toEqual({ city: null, error: 'overlap' })
    const roads: CityState = { size: 10, roads: ['2,4'], placements: [place('a', 'small', 4, 4)] }
    expect(scalePlacement(roads, 'a', 3, sizeOf)).toEqual({ city: null, error: 'road' })
    expect(scalePlacement(emptyCity(10), 'x', 2, sizeOf).city).toBeNull()
    const solo: CityState = { ...emptyCity(10), placements: [place('a', 'small', 4, 4)] }
    expect(scalePlacement(solo, 'a', 6, sizeOf)).toEqual({ city: null, error: 'out_of_bounds' }) // 12x12 cells
    expect(city.placements).toEqual([place('a', 'small', 4, 4), place('b', 'small', 6, 4)])
  })

  it('moving, rotating and duplicating keep the size and use the scaled footprint', () => {
    const city: CityState = { ...emptyCity(20), placements: [big('a', 'wide', 2, 2, 2)] } // 2x4 cells
    expect(movePlacement(city, 'a', 10, 10, sizeOf)!.placements[0]).toEqual(big('a', 'wide', 10, 10, 2))
    expect(rotatePlacement(city, 'a', sizeOf)!.placements[0]).toEqual(big('a', 'wide', 2, 2, 2, 1))
    expect(duplicateCell(city, city.placements[0], sizeOf)).toEqual({ cx: 4, cz: 2 })
    expect(planMove(city, city.placements[0], 160, 160, sizeOf)).toMatchObject({ cx: 18, cz: 16, s: 2, error: null })
  })
})

describe('vehicles on roads', () => {
  // Vehicles point their nose along the plate depth: `car` is 8 wide (the car template), `kid` a
  // 16-wide kid-built truck.
  const VSIZES: Record<string, SourceSize> = {
    car: { w: 8, d: 16, vehicle: true },
    kid: { w: 16, d: 24, vehicle: true },
    house: { w: 8, d: 8 },
  }
  const vsize = (source: string): SourceSize => VSIZES[source]
  // A street along Z at x = 2 (z 0..7) and an avenue along X at z = 9..10 (x 0..11).
  const street = Array.from({ length: 8 }, (_, z) => `2,${z}`)
  const avenue = Array.from({ length: 12 }, (_, x) => [`${x},9`, `${x},10`]).flat()
  const town = (extra: Partial<CityState> = {}): CityState => ({ size: 12, roads: [...street, ...avenue], placements: [], ...extra })

  it('lets a vehicle cover road cells and refuses a building there', () => {
    const city = town()
    expect(canPlaceInCity(city, place('v', 'car', 2, 3), vsize)).toBeNull()
    expect(canPlaceInCity(city, place('v', 'car', 1, 3, 1), vsize)).toBeNull() // road + grass
    expect(canPlaceInCity(city, place('h', 'house', 2, 3), vsize)).toBe('road')
  })
  it('refuses a vehicle on rails, water and other placements', () => {
    const city = town({ rails: ['5,3'], terrain: { water: ['6,6'], pavement: ['7,7'], sand: [] } })
    expect(canPlaceInCity(city, place('v', 'car', 5, 2), vsize)).toBe('rail')
    expect(canPlaceInCity(city, place('v', 'car', 6, 5), vsize)).toBe('water')
    expect(canPlaceInCity(city, place('v', 'car', 7, 6), vsize)).toBeNull() // pavement is fine
    const parked = { ...city, placements: [place('a', 'car', 2, 3)] }
    expect(canPlaceInCity(parked, place('b', 'car', 2, 4), vsize)).toBe('overlap')
    expect(canPlaceInCity(parked, place('h', 'house', 2, 4), vsize)).toBe('overlap')
  })
  it('shrinks a vehicle wider than a lane to the lane: a street and an avenue', () => {
    const city = town()
    const car = settleVehicle(city, place('v', 'car', 2, 3), vsize)
    expect(car.fit).toBeCloseTo(STREET_LANE_STUDS / 8, 4)
    expect(8 * car.fit!).toBeLessThanOrEqual(STREET_LANE_STUDS)
    expect(placementCells(car, VSIZES.car)).toEqual({ cw: 1, cd: 1 })
    const kid = settleVehicle(city, { ...place('k', 'kid', 1, 2), s: 2 }, vsize)
    expect(kid.s).toBe(2) // the size multiplier is kept; the fit does the shrinking
    expect(kid.fit).toBeCloseTo(STREET_LANE_STUDS / 32, 4)
    const onAvenue = settleVehicle(city, place('k', 'kid', 4, 9, 1), vsize)
    expect(onAvenue.fit).toBeCloseTo(AVENUE_LANE_STUDS / 16, 4)
    // Off the road: full size, no fit.
    expect(settleVehicle(city, place('v', 'car', 6, 3), vsize)).toEqual(place('v', 'car', 6, 3))
  })
  it('turns a vehicle along the road and snaps it into the road; settling twice changes nothing', () => {
    const city = town()
    // Dropped across the street (rot 1, 2 x 1 cells) with its centre on the street: turned along it.
    const across = settleVehicle(city, place('v', 'car', 1, 4, 1), vsize)
    expect(across.rot % 2).toBe(0)
    expect(across.cx).toBe(2)
    expect(settleVehicle(city, across, vsize)).toBe(across)
    // The avenue along X: a car facing N turns to face its half's traffic.
    const av = settleVehicle(city, place('v', 'car', 5, 9), vsize)
    expect(av.rot % 2).toBe(1)
    expect(av.cz === 9 || av.cz === 10).toBe(true)
    expect(settleVehicle(city, av, vsize)).toBe(av)
    // A dropped car (planPlacement) lands on the road it was dropped on, along it.
    const plan = planPlacement(city, 'car', 2.5 * CELL, 4.5 * CELL, vsize)
    expect(plan).toMatchObject({ cx: 2, cz: 4, error: null })
    expect(plan.rot % 2).toBe(0)
    expect(plan.fit).toBeLessThan(1)
  })
  it('gives a vehicle moved off the road its size back, and refuses growing it on the road', () => {
    const city = town({ placements: [settleVehicle(town(), place('v', 'car', 2, 3), vsize)] })
    const moved = movePlacement(city, 'v', 6, 3, vsize)
    expect(moved?.placements[0]).toEqual(place('v', 'car', 6, 3))
    expect(scalePlacement(city, 'v', 2, vsize)).toEqual({ city: null, error: 'road' })
    const back = movePlacement(moved!, 'v', 2, 3, vsize)
    expect(back?.placements[0].fit).toBeLessThan(1)
    // Rotating on a street turns it round (still along the street).
    const turned = rotatePlacement(city, 'v', vsize)
    expect(turned?.placements[0].rot).toBe((city.placements[0].rot + 2) % 4)
  })
})
