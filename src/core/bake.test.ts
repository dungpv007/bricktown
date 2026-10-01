import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { bakeBricks, bakeCacheSize, bakeKey, bakedGeometries, evictBakes } from './bake'
import { COLORS } from './colors'
import { bounds } from './model'
import { getPartGeometry } from './parts/geometry'
import { brickCenter } from './rotation'
import { platesToWorld } from './units'
import type { Brick } from './types'

const GLASS = 15
const TRANS_RED = 16
const SILVER = 28
const GOLD = 29
const STUD_HEIGHT = 0.17
const EPS = 0.02 // body inset (0.01 per side) plus float noise

const b = (id: string, p: string, x: number, y: number, z: number, r: 0 | 1 | 2 | 3 = 0, c = 2): Brick => ({
  id, p, x, y, z, r, c,
})

const vertexCount = (g: THREE.BufferGeometry) => g.getAttribute('position').count
const partVertices = (p: string) => vertexCount(getPartGeometry(p))

describe('bakeBricks', () => {
  it('merges all opaque bricks into one geometry with the summed vertex count', () => {
    const bricks = [b('a', 'brick_2x4', 0, 0, 0), b('b', 'plate_2x2', 0, 3, 0, 1), b('c', 'slope_2x2', 4, 0, 0, 2)]
    const { opaque, trans, metal } = bakeBricks(bricks)
    expect(trans).toBeNull()
    expect(metal).toBeNull()
    expect(vertexCount(opaque)).toBe(
      partVertices('brick_2x4') + partVertices('plate_2x2') + partVertices('slope_2x2'),
    )
  })

  it('has position, normal and linear colour attributes', () => {
    const { opaque } = bakeBricks([b('a', 'brick_1x1', 0, 0, 0, 0, 2)])
    expect(opaque.getAttribute('normal').count).toBe(vertexCount(opaque))
    const color = opaque.getAttribute('color')
    expect(color.itemSize).toBe(3)
    const expected = new THREE.Color(COLORS[2].hex)
    expect(color.getX(0)).toBeCloseTo(expected.r, 5)
    expect(color.getY(0)).toBeCloseTo(expected.g, 5)
    expect(color.getZ(0)).toBeCloseTo(expected.b, 5)
  })

  it('puts transparent-colour bricks (glass and the trans colours) in a separate geometry', () => {
    const bricks = [
      b('a', 'brick_2x4', 0, 0, 0),
      b('w', 'window_1x2x2', 0, 3, 0, 0, GLASS),
      b('x', 'brick_1x1', 3, 0, 0, 0, TRANS_RED),
    ]
    const { opaque, trans, metal } = bakeBricks(bricks)
    expect(vertexCount(opaque)).toBe(partVertices('brick_2x4'))
    expect(trans).not.toBeNull()
    expect(vertexCount(trans!)).toBe(partVertices('window_1x2x2') + partVertices('brick_1x1'))
    expect(metal).toBeNull()
    // The tint is the colour's own hex, like any other brick.
    const expected = new THREE.Color(COLORS[TRANS_RED].hex)
    const color = trans!.getAttribute('color')
    expect(color.getX(color.count - 1)).toBeCloseTo(expected.r, 5)
    expect(color.getY(color.count - 1)).toBeCloseTo(expected.g, 5)
    expect(color.getZ(color.count - 1)).toBeCloseTo(expected.b, 5)
  })

  it('puts metallic-colour bricks in their own geometry', () => {
    const bricks = [b('a', 'brick_2x4', 0, 0, 0), b('s', 'brick_1x1', 3, 0, 0, 0, SILVER), b('g', 'plate_2x2', 0, 3, 0, 0, GOLD)]
    const { opaque, trans, metal } = bakeBricks(bricks)
    expect(vertexCount(opaque)).toBe(partVertices('brick_2x4'))
    expect(trans).toBeNull()
    expect(vertexCount(metal!)).toBe(partVertices('brick_1x1') + partVertices('plate_2x2'))
  })

  it('returns an empty opaque geometry and no other groups for an empty model', () => {
    const { opaque, trans, metal } = bakeBricks([])
    expect(vertexCount(opaque)).toBe(0)
    expect(trans).toBeNull()
    expect(metal).toBeNull()
  })

  it('bounding box matches bounds() in world units (studs poke above the top)', () => {
    const bricks = [
      b('a', 'brick_2x4', 1, 0, 2, 0),
      b('b', 'brick_2x4', 1, 3, 2, 1), // rotated a quarter turn: 2 along Z, 4 along X
      b('c', 'plate_2x2', 0, 6, 0, 3),
    ]
    const bb = bounds(bricks)!
    const { opaque } = bakeBricks(bricks)
    opaque.computeBoundingBox()
    const box = opaque.boundingBox!
    expect(Math.abs(box.min.x - bb.minX)).toBeLessThanOrEqual(EPS)
    expect(Math.abs(box.max.x - bb.maxX)).toBeLessThanOrEqual(EPS)
    expect(Math.abs(box.min.z - bb.minZ)).toBeLessThanOrEqual(EPS)
    expect(Math.abs(box.max.z - bb.maxZ)).toBeLessThanOrEqual(EPS)
    expect(box.min.y).toBeCloseTo(platesToWorld(bb.minY), 5)
    expect(box.max.y).toBeCloseTo(platesToWorld(bb.maxY) + STUD_HEIGHT, 5)
  })

  it.each([0, 1, 2, 3] as const)('matches the Workshop instance transform at rotation %i', (r) => {
    const brick = b('a', 'slope_2x4', 3, 3, 5, r)
    const [cx, cy, cz] = brickCenter(brick)
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(cx, cy, cz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r * Math.PI) / 2),
      new THREE.Vector3(1, 1, 1),
    )
    const expected = getPartGeometry('slope_2x4').clone().applyMatrix4(matrix)
    const { opaque } = bakeBricks([brick])
    for (const name of ['position', 'normal']) {
      const got = opaque.getAttribute(name).array
      const want = expected.getAttribute(name).array
      expect(got.length).toBe(want.length)
      for (let i = 0; i < got.length; i++) expect(got[i]).toBeCloseTo(want[i], 4)
    }
  })

  it('does not mutate the shared part geometry', () => {
    const source = getPartGeometry('brick_2x4')
    const before = Array.from(source.getAttribute('position').array.slice(0, 12))
    bakeBricks([b('a', 'brick_2x4', 5, 3, 7, 1)])
    expect(Array.from(source.getAttribute('position').array.slice(0, 12))).toEqual(before)
    expect(source.getAttribute('color')).toBeUndefined()
  })

  it('returns the same cached object for equal content, ignoring brick ids', () => {
    const one = bakeBricks([b('a', 'brick_2x4', 0, 0, 0), b('b', 'brick_1x1', 4, 0, 0)])
    const two = bakeBricks([b('x', 'brick_2x4', 0, 0, 0), b('y', 'brick_1x1', 4, 0, 0)])
    expect(two).toBe(one)
    const other = bakeBricks([b('a', 'brick_2x4', 0, 0, 0), b('b', 'brick_1x1', 4, 0, 1)])
    expect(other).not.toBe(one)
  })
})

describe('evictBakes', () => {
  const disposed = (g: THREE.BufferGeometry) => {
    const seen = { value: false }
    g.addEventListener('dispose', () => (seen.value = true))
    return seen
  }

  it('drops and disposes the bakes whose key is not kept; kept ones stay shared', () => {
    evictBakes(new Set()) // start from an empty cache
    const live = [b('a', 'brick_2x4', 0, 0, 0)]
    const stale = [b('a', 'brick_2x4', 0, 0, 0), b('w', 'window_1x2x2', 0, 3, 0, 0, GLASS)]
    const keep = bakeBricks(live)
    const old = bakeBricks(stale)
    const opaqueGone = disposed(old.opaque)
    const transGone = disposed(old.trans!)
    const keptGone = disposed(keep.opaque)
    expect(bakeCacheSize()).toBe(2)

    expect(evictBakes(new Set([bakeKey(live)]))).toBe(1)
    expect(bakeCacheSize()).toBe(1)
    expect(opaqueGone.value).toBe(true)
    expect(transGone.value).toBe(true)
    expect(keptGone.value).toBe(false)
    expect(bakeBricks(live)).toBe(keep)
    // The evicted model is baked afresh next time it is needed.
    expect(bakeBricks(stale)).not.toBe(old)
  })

  it('empties the cache when nothing is kept', () => {
    bakeBricks([b('a', 'brick_1x1', 0, 0, 0)])
    evictBakes(new Set())
    expect(bakeCacheSize()).toBe(0)
  })
})

describe('bakedGeometries', () => {
  it('lists the non-empty geometries with their material kind, opaque first', () => {
    const all = bakeBricks([
      b('m', 'brick_1x1', 0, 0, 0, 0, GOLD),
      b('t', 'brick_1x1', 1, 0, 0, 0, GLASS),
      b('o', 'brick_1x1', 2, 0, 0, 0, 2),
    ])
    expect(bakedGeometries(all)).toEqual([
      ['opaque', all.opaque],
      ['trans', all.trans],
      ['metal', all.metal],
    ])
    const onlyMetal = bakeBricks([b('m', 'brick_1x1', 0, 0, 0, 0, SILVER)])
    expect(bakedGeometries(onlyMetal)).toEqual([['metal', onlyMetal.metal]])
    expect(bakedGeometries(bakeBricks([]))).toEqual([])
  })
})

describe('evictBakes metal', () => {
  it('disposes metal geometries too', () => {
    evictBakes(new Set())
    const baked = bakeBricks([b('m', 'brick_1x1', 0, 0, 0, 0, SILVER)])
    const seen = { value: false }
    baked.metal!.addEventListener('dispose', () => (seen.value = true))
    evictBakes(new Set())
    expect(seen.value).toBe(true)
  })
})

describe('bakeKey', () => {
  it('joins p,x,y,z,r,c per brick', () => {
    expect(bakeKey([b('a', 'brick_2x4', 1, 2, 3, 1, 4), b('b', 'brick_1x1', 0, 0, 0)])).toBe(
      'brick_2x4,1,2,3,1,4;brick_1x1,0,0,0,0,2',
    )
  })
})
