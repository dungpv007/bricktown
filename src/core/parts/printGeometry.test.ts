import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { PARTS, getPart } from './catalog'
import { PRINT_LIFT, getPrintGeometry, printPlane } from './printGeometry'
import { printUv } from '../prints'
import { platesToWorld } from '../units'

const attr = (g: THREE.BufferGeometry, name: string) => g.getAttribute(name)

function uvRange(g: THREE.BufferGeometry) {
  const uv = attr(g, 'uv')
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (let i = 0; i < uv.count; i++) {
    u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i))
    v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i))
  }
  return { u0, u1, v0, v1 }
}

describe('printPlane', () => {
  it('is a non-indexed quad facing +Z, centred, textured with the whole print', () => {
    const g = printPlane('clock', 2, 1.5)
    expect(g.index).toBeNull()
    expect(attr(g, 'position').count).toBe(6)
    expect(attr(g, 'normal').count).toBe(6)
    expect(attr(g, 'uv').count).toBe(6)
    g.computeBoundingBox()
    expect(g.boundingBox!.min.toArray()).toEqual([-1, -0.75, 0])
    expect(g.boundingBox!.max.toArray()).toEqual([1, 0.75, 0])
    const n = attr(g, 'normal')
    for (let i = 0; i < n.count; i++) expect([n.getX(i), n.getY(i), n.getZ(i)]).toEqual([0, 0, 1])
    expect(uvRange(g)).toEqual(printUv('clock'))
    // Counter-clockwise seen from +Z: the triangle normal agrees with the vertex normal.
    const p = attr(g, 'position')
    const a = new THREE.Vector3().fromBufferAttribute(p, 0)
    const b = new THREE.Vector3().fromBufferAttribute(p, 1)
    const c = new THREE.Vector3().fromBufferAttribute(p, 2)
    expect(b.sub(a).cross(c.sub(a)).z).toBeGreaterThan(0)
  })

  it('maps the print upright: its top edge (v1) on +Y', () => {
    const g = printPlane('stop', 1, 1)
    const p = attr(g, 'position')
    const uv = attr(g, 'uv')
    const { v0, v1 } = printUv('stop')
    for (let i = 0; i < p.count; i++) expect(uv.getY(i)).toBeCloseTo(p.getY(i) > 0 ? v1 : v0, 6)
  })
})

describe('getPrintGeometry', () => {
  it('is null for parts without a print', () => {
    expect(getPrintGeometry('brick_2x4')).toBeNull()
    expect(getPrintGeometry('tile_2x2')).toBeNull()
  })

  it('caches one geometry per printed part', () => {
    expect(getPrintGeometry('print_clock_2x2')).toBe(getPrintGeometry('print_clock_2x2'))
  })

  it('lays every printed tile flat on its top face, inside the footprint, text up towards -Z', () => {
    for (const part of PARTS.filter((p) => p.shape === 'tile_print')) {
      const g = getPrintGeometry(part.id)!
      expect(g, part.id).not.toBeNull()
      g.computeBoundingBox()
      const bb = g.boundingBox!
      const top = platesToWorld(part.h) / 2 + PRINT_LIFT
      expect(bb.min.y, part.id).toBeCloseTo(top, 6)
      expect(bb.max.y, part.id).toBeCloseTo(top, 6)
      expect(bb.max.x - bb.min.x, part.id).toBeLessThanOrEqual(part.w)
      expect(bb.max.z - bb.min.z, part.id).toBeLessThanOrEqual(part.d)
      expect(bb.max.x - bb.min.x, part.id).toBeGreaterThan(part.w * 0.9)
      const n = attr(g, 'normal')
      for (let i = 0; i < n.count; i++) expect(n.getY(i), part.id).toBeCloseTo(1, 6)
      const { v1 } = printUv(part.print!)
      const p = attr(g, 'position')
      const uv = attr(g, 'uv')
      for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) expect(uv.getY(i), part.id).toBeCloseTo(v1, 6)
      expect(uvRange(g), part.id).toEqual(printUv(part.print!))
    }
  })

  it('prints a sign board on both big faces, upright, at the print aspect, reading left to right from each side', () => {
    for (const part of PARTS.filter((p) => p.id.startsWith('board_'))) {
      const g = getPrintGeometry(part.id)!
      expect(g, part.id).not.toBeNull()
      g.computeBoundingBox()
      const bb = g.boundingBox!
      const H = platesToWorld(part.h)
      expect(bb.max.x - bb.min.x, part.id).toBeLessThanOrEqual(part.w)
      expect(bb.max.y - bb.min.y, part.id).toBeLessThanOrEqual(H)
      expect((bb.max.x - bb.min.x) / (bb.max.y - bb.min.y), part.id).toBeCloseTo(2, 4)
      const p = attr(g, 'position')
      const n = attr(g, 'normal')
      const uv = attr(g, 'uv')
      const { u0, u1, v1 } = printUv(part.print!)
      let front = 0, back = 0
      for (let i = 0; i < p.count; i++) {
        const side = Math.sign(n.getZ(i))
        expect(Math.abs(n.getZ(i)), part.id).toBeCloseTo(1, 6)
        expect(Math.sign(p.getZ(i)), part.id).toBe(side)
        if (side > 0) back++
        else front++
        if (p.getY(i) > 0) expect(uv.getY(i), part.id).toBeCloseTo(v1, 6)
        // The viewer's left on that side is the print's left edge (u0).
        const leftOfViewer = side > 0 ? p.getX(i) < 0 : p.getX(i) > 0
        expect(uv.getX(i), part.id).toBeCloseTo(leftOfViewer ? u0 : u1, 6)
      }
      expect([front, back], part.id).toEqual([6, 6])
    }
  })

  it('puts the computer screen on the front (+Z) of the monitor, inside the part', () => {
    const part = getPart('computer_1x2')
    const g = getPrintGeometry('computer_1x2')!
    g.computeBoundingBox()
    const bb = g.boundingBox!
    const H = platesToWorld(part.h)
    expect(bb.max.z - bb.min.z).toBeCloseTo(0, 6)
    expect(bb.min.x).toBeGreaterThanOrEqual(-part.w / 2)
    expect(bb.max.x).toBeLessThanOrEqual(part.w / 2)
    expect(bb.min.y).toBeGreaterThan(-H / 2)
    expect(bb.max.y).toBeLessThanOrEqual(H / 2)
    const n = attr(g, 'normal')
    for (let i = 0; i < n.count; i++) expect(n.getZ(i)).toBeCloseTo(1, 6)
    expect(uvRange(g)).toEqual(printUv('screen'))
  })
})
