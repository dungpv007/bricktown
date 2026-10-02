import { describe, expect, it } from 'vitest'
import type { BufferGeometry } from 'three'
import { PARTS, getPart } from './catalog'
import { getPartGeometry } from './geometry'
import { platesToWorld } from '../units'

function triangleCount(g: BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3
}

/** Signed volume via the divergence theorem; positive when faces wind outward. */
function signedVolume(g: BufferGeometry): number {
  const pos = g.getAttribute('position')
  const idx = g.index
  const n = idx ? idx.count : pos.count
  const at = (i: number) => (idx ? idx.getX(i) : i)
  let vol = 0
  for (let i = 0; i < n; i += 3) {
    const a = at(i), b = at(i + 1), c = at(i + 2)
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a)
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b)
    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c)
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return vol
}

describe('getPartGeometry', () => {
  it('returns a geometry with position and normal attributes for every part', () => {
    for (const p of PARTS) {
      const g = getPartGeometry(p.id)
      expect(g.getAttribute('position'), p.id).toBeDefined()
      expect(g.getAttribute('normal'), p.id).toBeDefined()
      expect(g.getAttribute('position').count, p.id).toBeGreaterThan(0)
      expect(g.getAttribute('normal').count, p.id).toBe(g.getAttribute('position').count)
      for (const v of g.getAttribute('position').array) expect(Number.isFinite(v), p.id).toBe(true)
    }
  })

  it('caches: repeated calls return the same instance', () => {
    expect(getPartGeometry('brick_2x4')).toBe(getPartGeometry('brick_2x4'))
    expect(getPartGeometry('brick_2x4')).not.toBe(getPartGeometry('brick_2x2'))
  })

  it('throws for an unknown part id', () => {
    expect(() => getPartGeometry('nope')).toThrow()
  })

  it('fits the part footprint and sits on the bottom of the bounding box', () => {
    for (const p of PARTS) {
      const g = getPartGeometry(p.id)
      g.computeBoundingBox()
      const bb = g.boundingBox!
      const H = platesToWorld(p.h)
      expect(bb.max.x - bb.min.x, `${p.id} x`).toBeLessThanOrEqual(p.w + 0.001)
      expect(bb.max.z - bb.min.z, `${p.id} z`).toBeLessThanOrEqual(p.d + 0.001)
      expect(Math.abs(bb.min.y + H / 2), `${p.id} minY`).toBeLessThanOrEqual(0.02)
    }
  })

  it('parts with studs reach above the body top', () => {
    for (const p of PARTS.filter((q) => q.studs)) {
      const g = getPartGeometry(p.id)
      g.computeBoundingBox()
      expect(g.boundingBox!.max.y, p.id).toBeGreaterThan(platesToWorld(p.h) / 2)
    }
  })

  it('parts without studs stay within the body height', () => {
    for (const p of PARTS.filter((q) => !q.studs)) {
      const g = getPartGeometry(p.id)
      g.computeBoundingBox()
      expect(g.boundingBox!.max.y, p.id).toBeLessThanOrEqual(platesToWorld(p.h) / 2 + 0.001)
    }
  })

  it('faces wind outward (positive enclosed volume) for every part', () => {
    for (const p of PARTS) expect(signedVolume(getPartGeometry(p.id)), p.id).toBeGreaterThan(0)
  })

  it('keeps brick_2x4 under the triangle budget', () => {
    expect(triangleCount(getPartGeometry('brick_2x4'))).toBeLessThan(1500)
  })

  it('places one stud per top cell', () => {
    // box = 12 triangles; each stud = 30 (10-segment open tube + its top disc; the bottom disc could never be seen)
    expect(triangleCount(getPartGeometry('brick_1x1'))).toBe(12 + 30)
    expect(triangleCount(getPartGeometry('brick_2x4'))).toBe(12 + 8 * 30)
    expect(triangleCount(getPartGeometry('tile_2x2'))).toBe(12)
  })

  it('slopes only carry studs on the back row', () => {
    expect(getPart('slope_2x2').studs).toBe(true)
    const bodyTop = platesToWorld(3) / 2
    const pos = getPartGeometry('slope_2x2').getAttribute('position')
    let studVerts = 0
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > bodyTop + 0.01) {
        studVerts++
        // back row of a 2-deep slope is z in [-1, 0]
        expect(pos.getZ(i)).toBeLessThanOrEqual(0)
      }
    }
    expect(studVerts).toBeGreaterThan(0)
  })
})
