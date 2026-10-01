import { describe, expect, it } from 'vitest'
import { boxCorners, fitView, framePoints, plateCorners, projectBounds, rectInside, type NdcRect, type Vec3 } from './viewFit'

const FOV = 45
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}
// The workshop's default view: from the front-right, a bit above.
const DIR = norm([0.45, 0.7, 0.75])

describe('plateCorners', () => {
  it('lists the four top corners of the plate', () => {
    expect(plateCorners({ w: 16, d: 8 })).toEqual([[0, 0, 0], [16, 0, 0], [16, 0, 8], [0, 0, 8]])
  })
})

describe('framePoints', () => {
  const tower = { minX: 3, minY: 0, minZ: 3, maxX: 13, maxY: 115, maxZ: 13 }
  it('lists a model box in world units (plates are 0.4 high)', () => {
    const corners = boxCorners(tower)
    expect(corners).toHaveLength(8)
    expect(corners).toContainEqual([3, 0, 3])
    expect(corners).toContainEqual([13, 46, 13])
  })
  it('is the plate alone without a model, the plate plus the model box with one', () => {
    expect(framePoints({ w: 16, d: 16 }, null)).toEqual(plateCorners({ w: 16, d: 16 }))
    expect(framePoints({ w: 16, d: 16 }, tower)).toEqual([...plateCorners({ w: 16, d: 16 }), ...boxCorners(tower)])
  })
  it('lets fitView show a whole tower, not just its plate', () => {
    const safe = { x0: -0.7, y0: -0.6, x1: 0.62, y1: 0.8 }
    const points = framePoints({ w: 16, d: 16 }, tower)
    const plateOnly = fitView(plateCorners({ w: 16, d: 16 }), DIR, FOV, 4 / 3, safe)
    // Framed for the plate alone, the tower's top is off screen (or even behind the camera).
    const cut = projectBounds(points, plateOnly.position, plateOnly.target, FOV, 4 / 3)
    expect(cut === null || !rectInside(cut, safe, 1e-3)).toBe(true)
    const { target, position } = fitView(points, DIR, FOV, 4 / 3, safe)
    expect(rectInside(projectBounds(points, position, target, FOV, 4 / 3)!, safe, 1e-3)).toBe(true)
  })
})

describe('projectBounds', () => {
  it('puts the look-at point at the screen centre', () => {
    const b = projectBounds([[5, 0, 5]], [5 + DIR[0] * 20, DIR[1] * 20, 5 + DIR[2] * 20], [5, 0, 5], FOV, 1.5)
    expect(b).not.toBeNull()
    expect(b!.x0).toBeCloseTo(0)
    expect(b!.y0).toBeCloseTo(0)
  })

  it('is null when a point is behind the camera', () => {
    expect(projectBounds([[0, 0, 100]], [0, 5, 10], [0, 0, 0], FOV, 1)).toBeNull()
  })
})

describe('fitView', () => {
  const cases: Array<{ name: string; size: { w: number; d: number }; aspect: number; safe: NdcRect }> = [
    { name: '16×16 on an iPad-like safe rect', size: { w: 16, d: 16 }, aspect: 4 / 3, safe: { x0: -0.7, y0: -0.6, x1: 0.62, y1: 0.8 } },
    { name: '48×48 on a wide screen', size: { w: 48, d: 48 }, aspect: 2000 / 960, safe: { x0: -0.9, y0: -0.6, x1: 0.82, y1: 0.85 } },
    { name: 'a long 8×48 plate', size: { w: 8, d: 48 }, aspect: 4 / 3, safe: { x0: -0.7, y0: -0.6, x1: 0.62, y1: 0.8 } },
  ]

  for (const c of cases) {
    it(`fits ${c.name} snugly inside the safe rect, keeping the view direction`, () => {
      const { target, position } = fitView(plateCorners(c.size), DIR, FOV, c.aspect, c.safe)
      expect(target[1]).toBe(0)
      const dir = norm([position[0] - target[0], position[1] - target[1], position[2] - target[2]])
      for (let i = 0; i < 3; i++) expect(dir[i]).toBeCloseTo(DIR[i], 6)

      const b = projectBounds(plateCorners(c.size), position, target, FOV, c.aspect)!
      expect(rectInside(b, c.safe, 1e-3)).toBe(true)
      // Snug: the plate fills the safe rect along at least one axis.
      const fillX = (b.x1 - b.x0) / (c.safe.x1 - c.safe.x0)
      const fillY = (b.y1 - b.y0) / (c.safe.y1 - c.safe.y0)
      expect(Math.max(fillX, fillY)).toBeGreaterThan(0.98)
    })
  }

  it('centres the plate in an off-centre safe rect', () => {
    const safe = { x0: -0.2, y0: -0.8, x1: 0.9, y1: 0.3 }
    const { target, position } = fitView(plateCorners({ w: 16, d: 16 }), DIR, FOV, 4 / 3, safe)
    const b = projectBounds(plateCorners({ w: 16, d: 16 }), position, target, FOV, 4 / 3)!
    expect((b.x0 + b.x1) / 2).toBeCloseTo((safe.x0 + safe.x1) / 2, 2)
    expect((b.y0 + b.y1) / 2).toBeCloseTo((safe.y0 + safe.y1) / 2, 2)
  })
})

describe('rectInside', () => {
  it('allows a small tolerance', () => {
    const safe = { x0: -1, y0: -1, x1: 1, y1: 1 }
    expect(rectInside({ x0: -0.5, y0: -0.5, x1: 0.5, y1: 0.5 }, safe)).toBe(true)
    expect(rectInside({ x0: -1.1, y0: -0.5, x1: 0.5, y1: 0.5 }, safe)).toBe(false)
    expect(rectInside({ x0: -1.0005, y0: -0.5, x1: 0.5, y1: 0.5 }, safe, 1e-3)).toBe(true)
  })
})
