import { describe, expect, it } from 'vitest'
import type { Brick, Rot } from './types'
import { getPart } from './parts/catalog'
import { brickCenter, cellsOf, footprint, nextRot, rotEquivalent } from './rotation'

const mk = (p: string, x: number, y: number, z: number, r: Rot): Brick => ({
  id: 'b', p, x, y, z, r, c: 0,
})

describe('footprint', () => {
  it('swaps w and d for odd rotations', () => {
    const p = getPart('brick_2x4')
    expect(footprint(p, 0)).toEqual({ fx: 2, fz: 4 })
    expect(footprint(p, 1)).toEqual({ fx: 4, fz: 2 })
    expect(footprint(p, 2)).toEqual({ fx: 2, fz: 4 })
    expect(footprint(p, 3)).toEqual({ fx: 4, fz: 2 })
  })
})

describe('cellsOf', () => {
  it('returns fx*fz*h cells starting at the min corner', () => {
    for (const r of [0, 1, 2, 3] as Rot[]) {
      const b = mk('brick_2x4', 3, 2, 5, r)
      const cells = cellsOf(b)
      const { fx, fz } = footprint(getPart('brick_2x4'), r)
      expect(cells).toHaveLength(fx * fz * 3)
      expect(new Set(cells.map((c) => c.join(','))).size).toBe(cells.length)
      expect(Math.min(...cells.map((c) => c[0]))).toBe(3)
      expect(Math.min(...cells.map((c) => c[1]))).toBe(2)
      expect(Math.min(...cells.map((c) => c[2]))).toBe(5)
      expect(Math.max(...cells.map((c) => c[0]))).toBe(3 + fx - 1)
      expect(Math.max(...cells.map((c) => c[1]))).toBe(2 + 3 - 1)
      expect(Math.max(...cells.map((c) => c[2]))).toBe(5 + fz - 1)
    }
  })

  it('covers tall parts across all plates', () => {
    expect(cellsOf(mk('door_1x4x6', 0, 0, 0, 0))).toHaveLength(4 * 1 * 18)
  })
})

describe('rotEquivalent', () => {
  const rots: Rot[] = [0, 1, 2, 3]
  it('sym 4: always true', () => {
    const p = getPart('brick_2x2')
    for (const a of rots) for (const b of rots) expect(rotEquivalent(p, a, b)).toBe(true)
  })
  it('sym 2: parity match', () => {
    const p = getPart('brick_2x4')
    for (const a of rots) for (const b of rots) expect(rotEquivalent(p, a, b)).toBe(a % 2 === b % 2)
  })
  it('sym 1: identity only', () => {
    const p = getPart('slope_2x2')
    for (const a of rots) for (const b of rots) expect(rotEquivalent(p, a, b)).toBe(a === b)
  })
})

describe('nextRot', () => {
  it('cycles 0->1->2->3->0', () => {
    expect(nextRot(0)).toBe(1)
    expect(nextRot(1)).toBe(2)
    expect(nextRot(2)).toBe(3)
    expect(nextRot(3)).toBe(0)
  })
})

describe('brickCenter', () => {
  it('brick_2x4 at origin, r=0', () => {
    const c = brickCenter(mk('brick_2x4', 0, 0, 0, 0))
    expect(c[0]).toBeCloseTo(1)
    expect(c[1]).toBeCloseTo(0.6)
    expect(c[2]).toBeCloseTo(2)
  })
  it('brick_2x4 at origin, r=1', () => {
    const c = brickCenter(mk('brick_2x4', 0, 0, 0, 1))
    expect(c[0]).toBeCloseTo(2)
    expect(c[1]).toBeCloseTo(0.6)
    expect(c[2]).toBeCloseTo(1)
  })
  it('accounts for y plate index', () => {
    const c = brickCenter(mk('brick_1x1', 1, 3, 2, 0))
    expect(c[0]).toBeCloseTo(1.5)
    expect(c[1]).toBeCloseTo(1.2 + 0.6)
    expect(c[2]).toBeCloseTo(2.5)
  })
})
