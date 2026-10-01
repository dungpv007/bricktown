import { describe, expect, it } from 'vitest'
import { Occupancy } from './occupancy'
import type { Brick } from './types'

const b = (id: string, x: number, y: number, z: number, p = 'brick_2x4', r: 0 | 1 | 2 | 3 = 0): Brick => ({
  id, p, x, y, z, r, c: 0,
})

describe('Occupancy', () => {
  it('maps every voxel to the brick id', () => {
    const occ = Occupancy.from([b('a', 1, 0, 2)])
    expect(occ.get(1, 0, 2)).toBe('a')
    expect(occ.get(2, 2, 5)).toBe('a') // 2 along X, 4 along Z, 3 plates tall
    expect(occ.get(3, 0, 2)).toBeUndefined()
    expect(occ.get(1, 3, 2)).toBeUndefined()
  })

  it('detects collisions and honours ignoreId', () => {
    const occ = Occupancy.from([b('a', 0, 0, 0)])
    expect(occ.collides(b('n', 1, 0, 1))).toBe(true)
    expect(occ.collides(b('n', 2, 0, 0))).toBe(false)
    expect(occ.collides(b('n', 0, 3, 0))).toBe(false)
    expect(occ.collides(b('a', 0, 0, 0), 'a')).toBe(false)
  })

  it('add and remove update voxels', () => {
    const occ = new Occupancy()
    const a = b('a', 0, 0, 0)
    occ.add(a)
    expect(occ.get(0, 0, 0)).toBe('a')
    occ.remove(a)
    expect(occ.get(0, 0, 0)).toBeUndefined()
  })

  it('supports ground, stacked (partial overlap) and rejects floating', () => {
    const occ = Occupancy.from([b('a', 0, 0, 0)])
    expect(occ.isSupported(b('g', 5, 0, 5))).toBe(true)
    expect(occ.isSupported(b('s', 1, 3, 3))).toBe(true) // overlaps only cell (1,*,3)
    expect(occ.isSupported(b('f', 3, 3, 0))).toBe(false)
    expect(occ.isSupported(b('f', 0, 6, 0))).toBe(false)
  })

  it('ignores ignoreId when checking support', () => {
    const occ = Occupancy.from([b('a', 0, 0, 0)])
    expect(occ.isSupported(b('s', 0, 3, 0), 'a')).toBe(false)
  })
})
