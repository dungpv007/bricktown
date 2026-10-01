import { describe, expect, it } from 'vitest'
import { paintRoadLine, roadKey, roadTileAt, type RoadTile } from './roads'
import type { Rot } from './types'

// Neighbour letters for the cell under test (4,4): N(-Z) E(+X) S(+Z) W(-X).
const cases: Array<[string, RoadTile, Rot]> = [
  ['', 'isolated', 0],
  ['N', 'end', 0],
  ['W', 'end', 1],
  ['S', 'end', 2],
  ['E', 'end', 3],
  ['NS', 'straight', 0],
  ['EW', 'straight', 1],
  ['NE', 'corner', 0],
  ['NW', 'corner', 1],
  ['SW', 'corner', 2],
  ['ES', 'corner', 3],
  ['NES', 'tee', 0], // missing W
  ['NEW', 'tee', 1], // missing S
  ['NSW', 'tee', 2], // missing E
  ['ESW', 'tee', 3], // missing N
  ['NESW', 'cross', 0],
]

const OFFSET: Record<string, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

describe('roadTileAt', () => {
  it.each(cases)('neighbours "%s" -> %s rot %i', (dirs, tile, rot) => {
    const roads = new Set<string>([roadKey(4, 4)])
    for (const d of dirs) {
      const [dx, dz] = OFFSET[d]
      roads.add(roadKey(4 + dx, 4 + dz))
    }
    expect(roadTileAt(roads, 4, 4)).toEqual({ tile, rot })
  })

  it('covers 16 distinct neighbour combinations', () => {
    expect(new Set(cases.map((c) => [...c[0]].sort().join(''))).size).toBe(16)
  })
})

describe('paintRoadLine', () => {
  it('draws an L path first along X then along Z', () => {
    const out = paintRoadLine([], { cx: 1, cz: 1 }, { cx: 3, cz: 3 })
    expect(out).toEqual(['1,1', '2,1', '3,1', '3,2', '3,3'])
  })

  it('works towards negative directions', () => {
    const out = paintRoadLine([], { cx: 3, cz: 3 }, { cx: 1, cz: 2 })
    expect(out).toEqual(['3,3', '2,3', '1,3', '1,2'])
  })

  it('paints a single cell when from equals to', () => {
    expect(paintRoadLine([], { cx: 2, cz: 2 }, { cx: 2, cz: 2 })).toEqual(['2,2'])
  })

  it('merges with existing roads without duplicates and without mutating', () => {
    const existing = ['2,1', '9,9']
    const out = paintRoadLine(existing, { cx: 1, cz: 1 }, { cx: 3, cz: 1 })
    expect(out.slice().sort()).toEqual(['1,1', '2,1', '3,1', '9,9'])
    expect(existing).toEqual(['2,1', '9,9'])
  })
})
