import { describe, expect, it } from 'vitest'
import {
  MAX_BRICKS, MAX_HEIGHT_PLATES, addBrick, bounds, canPlace, moveBrick, paintBrick, removeBrick, restyleFigure, rotateBrick,
} from './model'
import { DEFAULT_FIG, figPreset } from './figures'
import type { Baseplate, Brick } from './types'

const bp: Baseplate = { w: 8, d: 8 }
const b = (id: string, x: number, y: number, z: number, p = 'brick_2x4', r: 0 | 1 | 2 | 3 = 0): Brick => ({
  id, p, x, y, z, r, c: 0,
})

describe('canPlace', () => {
  it('accepts a brick on the ground', () => {
    expect(canPlace([], b('a', 0, 0, 0), bp)).toBeNull()
  })
  it('rejects overlapping 2x4s', () => {
    expect(canPlace([b('a', 0, 0, 0)], b('n', 1, 0, 1), bp)).toBe('collision')
  })
  it('rejects floating bricks, accepts partial-overlap stacking', () => {
    const base = [b('a', 0, 0, 0)]
    expect(canPlace(base, b('f', 4, 3, 0), bp)).toBe('unsupported')
    expect(canPlace(base, b('s', 1, 3, 3), bp)).toBeNull()
  })
  it('rejects out of bounds at edges', () => {
    expect(canPlace([], b('a', 6, 0, 0), bp)).toBeNull()
    expect(canPlace([], b('a', 7, 0, 0), bp)).toBe('out_of_bounds')
    expect(canPlace([], b('a', 0, 0, 5), bp)).toBe('out_of_bounds')
    expect(canPlace([], b('a', -1, 0, 0), bp)).toBe('out_of_bounds')
    expect(canPlace([], b('a', 0, -1, 0), bp)).toBe('out_of_bounds')
  })
  it('uses the rotated footprint for bounds', () => {
    // r=1: 4 along X, 2 along Z
    expect(canPlace([], b('a', 4, 0, 0, 'brick_2x4', 1), bp)).toBeNull()
    expect(canPlace([], b('a', 5, 0, 0, 'brick_2x4', 1), bp)).toBe('out_of_bounds')
    expect(canPlace([], b('a', 0, 0, 6, 'brick_2x4', 1), bp)).toBeNull()
    expect(canPlace([], b('a', 0, 0, 7, 'brick_2x4', 1), bp)).toBe('out_of_bounds')
  })
  it('allows towers 48 bricks tall', () => {
    expect(MAX_HEIGHT_PLATES).toBe(144)
  })
  it('rejects above max height', () => {
    expect(canPlace([], b('a', 0, MAX_HEIGHT_PLATES - 3, 0), bp)).not.toBe('out_of_bounds')
    expect(canPlace([], b('a', 0, MAX_HEIGHT_PLATES - 2, 0), bp)).toBe('out_of_bounds')
  })
  it('enforces MAX_BRICKS, unless ignoreId is set', () => {
    const many = Array.from({ length: MAX_BRICKS }, (_, i) => b(`m${i}`, 0, 0, 0, 'brick_1x1'))
    expect(canPlace(many, b('n', 5, 0, 5, 'brick_1x1'), bp)).toBe('limit')
    expect(canPlace(many, b('m0', 5, 0, 5, 'brick_1x1'), bp, 'm0')).toBeNull()
  })
})

describe('model operations', () => {
  it('addBrick returns a new array and leaves input untouched', () => {
    const input: Brick[] = []
    const res = addBrick(input, b('a', 0, 0, 0), bp)
    expect(res.error).toBeNull()
    expect(res.bricks).toHaveLength(1)
    expect(input).toHaveLength(0)
  })
  it('addBrick returns the unchanged array on error', () => {
    const input = [b('a', 0, 0, 0)]
    const res = addBrick(input, b('n', 0, 0, 0), bp)
    expect(res.error).toBe('collision')
    expect(res.bricks).toBe(input)
  })
  it('removeBrick removes only the tapped brick', () => {
    const input = [b('a', 0, 0, 0), b('s', 0, 3, 0)]
    const out = removeBrick(input, 'a')
    expect(out.map((x) => x.id)).toEqual(['s'])
    expect(input).toHaveLength(2)
  })
  it('paintBrick changes color immutably', () => {
    const input = [b('a', 0, 0, 0)]
    const out = paintBrick(input, 'a', 5)
    expect(out[0].c).toBe(5)
    expect(input[0].c).toBe(0)
  })
  it('paintBrick on a figure recolours its torso (and keeps c in step with it)', () => {
    const fig: Brick = { ...b('f', 0, 0, 0, 'minifig'), c: 0, fig: figPreset('chef') }
    const out = paintBrick([fig], 'f', 2)
    expect(out[0]).toEqual({ ...fig, c: 2, fig: { ...figPreset('chef'), torso: 2 } })
    // A figure without a style starts from the default one.
    const bare: Brick = { ...b('g', 0, 0, 0, 'minifig'), c: DEFAULT_FIG.torso }
    expect(paintBrick([bare], 'g', 5)[0].fig).toEqual({ ...DEFAULT_FIG, torso: 5 })
    // See-through paint gives the nearest solid colour (trans red: red); metal is worn as is.
    expect(paintBrick([fig], 'f', 16)[0]).toMatchObject({ c: 2, fig: { torso: 2 } })
    expect(paintBrick([fig], 'f', 29)[0]).toMatchObject({ c: 29, fig: { torso: 29 } })
  })
  it('restyleFigure sets a figure style immutably, c following the torso', () => {
    const input: Brick[] = [{ ...b('f', 0, 0, 0, 'minifig'), fig: figPreset('chef') }, b('a', 4, 0, 4)]
    const out = restyleFigure(input, 'f', figPreset('robber'))
    expect(out[0]).toEqual({ ...input[0], c: figPreset('robber').torso, fig: figPreset('robber') })
    expect(out[1]).toBe(input[1])
    expect(input[0].fig).toEqual(figPreset('chef'))
    // Only figures carry a style.
    expect(restyleFigure(input, 'a', figPreset('robber'))).toBe(input)
  })
  it('places a figure like a brick: supported, colliding by its footprint, bricks on its head', () => {
    const fig: Brick = { ...b('f', 2, 0, 2, 'minifig'), fig: figPreset('chef') }
    expect(canPlace([], fig, bp)).toBeNull()
    expect(canPlace([], { ...fig, y: 3 }, bp)).toBe('unsupported')
    expect(canPlace([fig], { ...b('x', 3, 5, 2, 'brick_1x1') }, bp)).toBe('collision')
    // A 1x1 brick on the head (12 plates up).
    expect(canPlace([fig], { ...b('x', 3, 12, 2, 'brick_1x1') }, bp)).toBeNull()
    // Standing on a plate.
    const plate = b('p', 0, 0, 0, 'plate_4x4')
    expect(canPlace([plate], { ...fig, y: 1 }, bp)).toBeNull()
  })
  it('rotateBrick rotates in place', () => {
    const input = [b('a', 0, 0, 0)]
    const res = rotateBrick(input, 'a', bp)
    expect(res.error).toBeNull()
    expect(res.bricks[0].r).toBe(1)
    expect(input[0].r).toBe(0)
  })
  it('rotateBrick is blocked by a neighbour', () => {
    const input = [b('a', 0, 0, 0), b('n', 2, 0, 0, 'brick_2x2')]
    const res = rotateBrick(input, 'a', bp)
    expect(res.error).toBe('collision')
    expect(res.bricks).toBe(input)
  })
  it('rotateBrick is blocked at the baseplate edge', () => {
    const input = [b('a', 6, 0, 0)]
    const res = rotateBrick(input, 'a', bp)
    expect(res.error).toBe('out_of_bounds')
  })
  it('moveBrick moves, and rejects invalid targets', () => {
    const input = [b('a', 0, 0, 0), b('n', 4, 0, 0)]
    const ok = moveBrick(input, 'a', { x: 0, y: 0, z: 4 }, bp)
    expect(ok.error).toBeNull()
    expect(ok.bricks.find((x) => x.id === 'a')).toMatchObject({ x: 0, y: 0, z: 4 })
    expect(input[0]).toMatchObject({ x: 0, y: 0, z: 0 })
    expect(moveBrick(input, 'a', { x: 4, y: 0, z: 0 }, bp).error).toBe('collision')
    expect(moveBrick(input, 'a', { x: 0, y: 6, z: 0 }, bp).error).toBe('unsupported')
    // may overlap its own old position
    expect(moveBrick(input, 'a', { x: 1, y: 0, z: 0 }, bp).error).toBeNull()
  })
  it('bounds', () => {
    expect(bounds([])).toBeNull()
    expect(bounds([b('a', 1, 0, 2), b('c', 3, 3, 0, 'brick_2x4', 1)])).toEqual({
      minX: 1, minY: 0, minZ: 0, maxX: 7, maxY: 6, maxZ: 6,
    })
  })
})
