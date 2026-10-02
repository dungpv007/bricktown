import { describe, expect, it } from 'vitest'
import { canPlaceInCity, type SourceSize } from './city'
import { cellGraph, components, isLoop, pathOrder } from './cellGraph'
import {
  addRails,
  eraseRails,
  eraseRoads,
  invalidCrossings,
  isValidCrossing,
  levelCrossings,
  paintRails,
  paintRoads,
  railLines,
  railTileAt,
  roadGraph,
} from './rails'
import { paintRoadLine } from './roads'
import type { CityPlacement, CityState } from './types'

const SIZES: Record<string, SourceSize> = { house: { w: 8, d: 8 }, big: { w: 16, d: 16 } }
const sizeOf = (s: string) => SIZES[s]
const city = (over: Partial<CityState> = {}): CityState => ({ size: 10, roads: [], placements: [], ...over })
const pl = (id: string, source: string, cx: number, cz: number, extra: Partial<CityPlacement> = {}): CityPlacement => ({
  id, source, cx, cz, rot: 0, ...extra,
})
const line = (a: [number, number], b: [number, number]) => paintRoadLine([], { cx: a[0], cz: a[1] }, { cx: b[0], cz: b[1] })
const sorted = (keys: string[] | undefined) => [...(keys ?? [])].sort()

describe('railTileAt (auto-tiling from rail neighbours)', () => {
  const rails = new Set(['1,0', '1,1', '1,2', '2,1', '0,1', '3,3', '5,5', '6,5', '5,6', '8,8', '8,9'])
  it('picks the tile like roads do', () => {
    expect(railTileAt(rails, 1, 1)).toEqual({ tile: 'cross', rot: 0 })
    expect(railTileAt(rails, 1, 0).tile).toBe('end')
    expect(railTileAt(rails, 3, 3).tile).toBe('isolated')
    expect(railTileAt(rails, 5, 5).tile).toBe('corner')
    expect(railTileAt(rails, 8, 8)).toEqual({ tile: 'end', rot: 2 }) // open towards +Z
    const tee = new Set(['0,0', '1,0', '2,0', '1,1'])
    expect(railTileAt(tee, 1, 0).tile).toBe('tee')
    const straight = new Set(['0,0', '1,0', '2,0'])
    expect(railTileAt(straight, 1, 0)).toEqual({ tile: 'straight', rot: 1 }) // along X
  })
})

describe('painting and erasing rails', () => {
  it('paints an L of rails, skipping cells under models or on water', () => {
    const c = city({ placements: [pl('h', 'house', 3, 0)], terrain: { water: ['5,0'], pavement: [], sand: [] } })
    const out = paintRails(c, line([0, 0], [6, 0]), sizeOf)
    expect(out.error).toBeNull()
    expect(sorted(out.city?.rails)).toEqual(['0,0', '1,0', '2,0', '4,0', '6,0'])
    expect(addRails(c, ['5,0', '3,0', '-1,0', '10,0'], sizeOf)).toEqual(c) // nothing to add: no field
  })
  it('refuses a stroke that paints nothing: on water says water, else overlap', () => {
    const c = city({ rails: ['0,0'], terrain: { water: ['1,0'], pavement: [], sand: [] } })
    expect(paintRails(c, ['1,0'], sizeOf)).toEqual({ city: null, error: 'water' })
    expect(paintRails(c, ['0,0'], sizeOf)).toEqual({ city: null, error: 'overlap' })
    expect(paintRoads(c, ['1,0'], sizeOf)).toEqual({ city: null, error: 'water' })
  })
  it('erases rails, dropping the field when none are left', () => {
    const c = city({ rails: ['0,0', '1,0'] })
    expect(eraseRails(c, ['0,0'])?.rails).toEqual(['1,0'])
    expect(eraseRails(c, ['0,0', '1,0'])).toEqual(city())
    expect(eraseRails(c, ['5,5'])).toBeNull()
    expect(eraseRails(city(), ['5,5'])).toBeNull()
  })
})

describe('level crossings', () => {
  // A rail along X on row 5 (cells 2..7), a road along Z on column 4.
  const rail = city({ rails: line([2, 5], [7, 5]) })

  it('allows a road crossing a straight rail at right angles', () => {
    const out = paintRoads(rail, line([4, 2], [4, 8]), sizeOf)
    expect(out.error).toBeNull()
    expect(levelCrossings(out.city!)).toEqual(['4,5'])
    expect(invalidCrossings(out.city!)).toEqual([])
    expect(isValidCrossing(new Set(out.city!.roads), new Set(out.city!.rails), 4, 5)).toBe(true)
    // ...and a rail painted across a straight road.
    const road = city({ roads: line([4, 2], [4, 8]) })
    expect(paintRails(road, line([2, 5], [7, 5]), sizeOf).error).toBeNull()
  })

  it('refuses a road along the rail, a road ending or turning on it, or a crossing on a rail curve', () => {
    expect(paintRoads(rail, line([3, 5], [5, 5]), sizeOf)).toEqual({ city: null, error: 'crossing' }) // parallel
    expect(paintRoads(rail, line([4, 2], [4, 5]), sizeOf).error).toBe('crossing') // a road end on the rail
    expect(paintRoads(rail, line([1, 4], [4, 4]).concat(line([4, 4], [4, 5])), sizeOf).error).toBe('crossing')
    const curve = city({ rails: [...line([2, 5], [5, 5]), ...line([5, 5], [5, 8])] })
    expect(paintRoads(curve, line([5, 2], [5, 9]), sizeOf).error).toBe('crossing')
    // The whole stroke is refused: the city is unchanged.
    expect(paintRoads(rail, line([0, 0], [3, 5]), sizeOf).city).toBeNull()
  })

  it('refuses widening a road next to a crossing (the crossing would become a junction)', () => {
    const crossed = paintRoads(rail, line([4, 2], [4, 8]), sizeOf).city!
    expect(paintRoads(crossed, ['3,5'], sizeOf).error).toBe('crossing') // would also lie on the rail
    expect(paintRoads(crossed, line([3, 4], [3, 6]), sizeOf).error).toBe('crossing')
    expect(paintRails(crossed, line([4, 4], [4, 4]), sizeOf).error).toBe('crossing')
  })

  it('erasing next to a crossing takes away the half-crossing it would leave', () => {
    const crossed = paintRoads(rail, line([4, 2], [4, 8]), sizeOf).city!
    const out = eraseRoads(crossed, ['4,6', '4,7', '4,8'])!
    expect(out.roads).not.toContain('4,5') // the crossing's road went with it
    expect(sorted(out.roads)).toEqual(['4,2', '4,3', '4,4'])
    expect(out.rails).toContain('4,5')
    const railCut = eraseRails(crossed, ['5,5', '6,5', '7,5'])!
    expect(railCut.rails).not.toContain('4,5')
    expect(railCut.roads).toContain('4,5')
    expect(invalidCrossings(railCut)).toEqual([])
  })
})

describe('placements and rails', () => {
  it('keeps models off rails, also when scaled', () => {
    const c = city({ rails: ['3,3'] })
    expect(canPlaceInCity(c, pl('h', 'house', 3, 3), sizeOf)).toBe('rail')
    expect(canPlaceInCity(c, pl('h', 'house', 2, 2), sizeOf)).toBeNull()
    expect(canPlaceInCity(c, pl('h', 'house', 2, 2, { s: 2 }), sizeOf)).toBe('rail')
    expect(canPlaceInCity(c, pl('h', 'big', 2, 2), sizeOf)).toBe('rail')
  })
})

describe('rail and road graphs', () => {
  it('builds the 4-neighbour graph and its components, biggest first', () => {
    const g = cellGraph(['0,0', '1,0', '1,1', '5,5'])
    expect(g.get('1,0')).toEqual(['1,1', '0,0']) // N, E, S, W order
    expect(components(g)).toEqual([['0,0', '1,0', '1,1'], ['5,5']])
    expect(roadGraph(city({ roads: ['2,2', '2,3'] })).get('2,2')).toEqual(['2,3'])
  })

  it('tells a loop from a line and orders their cells along the track', () => {
    const loopCells = [...line([1, 1], [4, 3]), ...line([4, 3], [1, 1])] // two Ls: a 4 x 3 rectangle
    const lines = railLines(city({ rails: [...loopCells, ...line([7, 0], [7, 4]), '9,9'] }))
    expect(lines.map((l) => [l.cells.length, l.loop])).toEqual([[10, true], [5, false], [1, false]])
    const [loop, open] = lines
    expect(loop.path).toHaveLength(10)
    // Consecutive path cells are neighbours (and the loop closes).
    const adjacent = (a: string, b: string) => {
      const [ax, az] = a.split(',').map(Number)
      const [bx, bz] = b.split(',').map(Number)
      return Math.abs(ax - bx) + Math.abs(az - bz) === 1
    }
    loop.path!.forEach((k, i) => expect(adjacent(k, loop.path![(i + 1) % 10])).toBe(true))
    expect([open.path![0], open.path![4]].sort()).toEqual(['7,0', '7,4'])
    const branching = cellGraph(['0,0', '1,0', '2,0', '1,1'])
    expect(pathOrder(branching, ['0,0', '1,0', '2,0', '1,1'])).toBeNull()
    expect(isLoop(branching, ['0,0', '1,0', '2,0', '1,1'])).toBe(false)
  })
})
