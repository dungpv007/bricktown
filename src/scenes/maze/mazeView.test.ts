import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { frameMaze, mazeCorners, safeRect, type NdcRect } from './mazeView'

/** Screen bounds of the maze seen by a real three.js camera placed by `frameMaze`. */
function projected(w: number, h: number, aspect: number, safe: NdcRect) {
  const fov = 45
  const { target, position } = frameMaze(w, h, aspect, fov, safe)
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 5000)
  cam.position.set(...position)
  cam.lookAt(...target)
  cam.updateMatrixWorld()
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const p of mazeCorners(w, h)) {
    const v = new THREE.Vector3(...p).project(cam)
    b.x0 = Math.min(b.x0, v.x)
    b.x1 = Math.max(b.x1, v.x)
    b.y0 = Math.min(b.y0, v.y)
    b.y1 = Math.max(b.y1, v.y)
  }
  return { b, target, position }
}

describe('frameMaze', () => {
  const safe = safeRect(1080, 810, { left: 100, right: 100, top: 90, bottom: 80 })

  for (const [w, h] of [
    [7, 7],
    [15, 15],
    [21, 9],
  ]) {
    it(`fits a ${w}x${h} maze inside the free part of the screen, filling it one way`, () => {
      const { b, target } = projected(w, h, 1080 / 810, safe)
      const eps = 0.01
      expect(b.x0).toBeGreaterThanOrEqual(safe.x0 - eps)
      expect(b.x1).toBeLessThanOrEqual(safe.x1 + eps)
      expect(b.y0).toBeGreaterThanOrEqual(safe.y0 - eps)
      expect(b.y1).toBeLessThanOrEqual(safe.y1 + eps)
      const fillW = (b.x1 - b.x0) / (safe.x1 - safe.x0)
      const fillH = (b.y1 - b.y0) / (safe.y1 - safe.y0)
      expect(Math.max(fillW, fillH)).toBeGreaterThan(0.97)
      // Centred in the free rectangle.
      expect((b.x0 + b.x1) / 2).toBeCloseTo((safe.x0 + safe.x1) / 2, 1)
      expect((b.y0 + b.y1) / 2).toBeCloseTo((safe.y0 + safe.y1) / 2, 1)
      expect(target[1]).toBe(0)
    })
  }

  it('looks from the south and above, further away for bigger mazes', () => {
    const small = frameMaze(7, 7, 4 / 3, 45, safe)
    const big = frameMaze(15, 15, 4 / 3, 45, safe)
    expect(big.distance).toBeGreaterThan(small.distance)
    expect(small.position[1]).toBeGreaterThan(0)
    expect(small.position[2]).toBeGreaterThan(small.target[2])
  })
})

describe('safeRect', () => {
  it('turns pixel margins into NDC, and falls back to the full screen when the HUD leaves no room', () => {
    expect(safeRect(1000, 500, { left: 100, right: 0, top: 50, bottom: 0 })).toEqual({ x0: -0.8, x1: 1, y0: -1, y1: 0.8 })
    expect(safeRect(100, 100, { left: 60, right: 60, top: 0, bottom: 0 })).toEqual({ x0: -1, y0: -1, x1: 1, y1: 1 })
  })
})
