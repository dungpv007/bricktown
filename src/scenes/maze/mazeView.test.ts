import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { MAZE_CELL } from '../../core/maze'
import { cellCenterXZ } from '../../core/mazeRun'
import { STEP_DIRS, TOP_VIEW_DELTA } from '../../core/mazeStep'
import { MAZE_TILT, TOP_VIEW_FOLLOW_CELLS, followDistance, frameMaze, mazeCorners, topViewShowsWhole, type NdcRect } from './mazeView'

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
  // A 1080 x 810 canvas with HUD columns of 100 px left and right, 90 px on top and 80 px below.
  const safe: NdcRect = { x0: -1 + 200 / 1080, x1: 1 - 200 / 1080, y0: -1 + 160 / 810, y1: 1 - 180 / 810 }

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

describe('the drive top-down view', () => {
  it('shows mazes up to 15 x 15 whole, follows the car in bigger ones', () => {
    expect(topViewShowsWhole(7, 7)).toBe(true)
    expect(topViewShowsWhole(15, 15)).toBe(true)
    expect(topViewShowsWhole(17, 9)).toBe(false)
    expect(topViewShowsWhole(21, 21)).toBe(false)
  })

  it('a whole maze fits a portrait phone too', () => {
    // 412 x 891 with the D-pad below and the button column on the right.
    const safe: NdcRect = { x0: -1 + 24 / 412, x1: 1 - 140 / 412, y0: -1 + 380 / 891, y1: 1 - 120 / 891 }
    const { b } = projected(11, 11, 412 / 891, safe)
    expect(b.x0).toBeGreaterThanOrEqual(safe.x0 - 0.01)
    expect(b.x1).toBeLessThanOrEqual(safe.x1 + 0.01)
    expect(b.y0).toBeGreaterThanOrEqual(safe.y0 - 0.01)
    expect(b.y1).toBeLessThanOrEqual(safe.y1 + 0.01)
  })

  for (const aspect of [1080 / 810, 412 / 891, 891 / 412]) {
    it(`following the car shows about ${TOP_VIEW_FOLLOW_CELLS} cells across the short side (aspect ${aspect.toFixed(2)})`, () => {
      const fov = 50
      const d = followDistance(aspect, fov)
      const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 5000)
      cam.position.set(0, d * Math.cos(MAZE_TILT), d * Math.sin(MAZE_TILT))
      cam.lookAt(0, 0, 0)
      cam.updateMatrixWorld()
      const half = (TOP_VIEW_FOLLOW_CELLS * MAZE_CELL) / 2
      const across = aspect >= 1
        ? [new THREE.Vector3(0, 0, -half), new THREE.Vector3(0, 0, half)].map((p) => p.project(cam).y)
        : [new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0)].map((p) => p.project(cam).x)
      const span = Math.abs(across[1] - across[0]) / 2 // share of the short side
      expect(span).toBeGreaterThan(0.85)
      expect(span).toBeLessThan(1.15)
    })
  }

  it('the step directions are screen directions: up goes up the screen, right goes right', () => {
    const aspect = 1080 / 810
    const { target, position } = frameMaze(11, 11, aspect, 50, { x0: -0.8, x1: 0.8, y0: -0.8, y1: 0.8 })
    const cam = new THREE.PerspectiveCamera(50, aspect, 0.1, 5000)
    cam.position.set(...position)
    cam.lookAt(...target)
    cam.updateMatrixWorld()
    const screen = (cx: number, cz: number) => {
      const { x, z } = cellCenterXZ({ cx, cz })
      return new THREE.Vector3(x, 0, z).project(cam)
    }
    const from = screen(5, 5)
    for (const dir of STEP_DIRS) {
      const { dx, dz } = TOP_VIEW_DELTA[dir]
      const to = screen(5 + dx, 5 + dz)
      const moved = { x: to.x - from.x, y: to.y - from.y }
      const want = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[dir]
      // Mostly along the wanted screen axis, the right way.
      expect(Math.sign(moved.x * want[0] + moved.y * want[1])).toBe(1)
      expect(Math.abs(want[0] ? moved.y : moved.x)).toBeLessThan(0.2 * Math.abs(want[0] ? moved.x : moved.y))
    }
  })
})
