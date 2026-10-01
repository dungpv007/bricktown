import { describe, expect, it } from 'vitest'
import { TEMPLATES, getTemplate } from '../../content/templates'
import { bounds } from '../../core/model'
import type { Template } from '../../core/types'
import { platesToWorld } from '../../core/units'
import {
  MAX_MODEL_ZOOM_OUT, VIEW_FOV, allowedRect, boxCorners, defaultView, fitDistance, fitView, framePoints, guidedFrame,
  plateCorners, projectBounds, rectInside, stepRefit, boxVisible, workshopFit, type NdcRect, type Vec3, type View,
} from './viewFit'

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

// Safe rects measured from the Guided HUD on an iPad (hudFreeRect, NDC).
const IPAD = {
  landscapeNormal: { aspect: 1080 / 810, safe: { x0: -0.696, x1: 0.718, y0: -0.723, y1: 0.793 } },
  landscapeEasy: { aspect: 1080 / 810, safe: { x0: -0.696, x1: 0.978, y0: -0.97, y1: 0.793 } },
  portraitNormal: { aspect: 810 / 1080, safe: { x0: -0.595, x1: 0.625, y0: -0.793, y1: 0.844 } },
  portraitEasy: { aspect: 810 / 1080, safe: { x0: -0.595, x1: 0.97, y0: -0.978, y1: 0.844 } },
}
const sameView = (a: View, b: View) => a.position.every((v, i) => v === b.position[i]) && a.target.every((v, i) => v === b.target[i])
const dist = (v: View) => Math.hypot(...v.position.map((p, i) => p - v.target[i]))
const dirOf = (v: View) => norm(v.position.map((p, i) => p - v.target[i]) as Vec3)
const stepsBox = (t: Template, n: number) => bounds(t.steps.slice(0, n).flat().map((i) => t.bricks[i]))

describe('defaultView', () => {
  it('looks at the plate centre on the ground from the front-right, a bit above', () => {
    const v = defaultView({ w: 16, d: 16 })
    expect(v.target).toEqual([8, 0, 8])
    expect(v.position).toEqual([8 + 32 * 0.45, 32 * 0.7, 8 + 32 * 0.75])
  })
})

describe('allowedRect', () => {
  it('is the safe rect grown to the plate on screen, clamped to the screen', () => {
    const view = defaultView({ w: 32, d: 32 })
    const { aspect, safe } = IPAD.landscapeNormal
    const plate = projectBounds(plateCorners({ w: 32, d: 32 }), view.position, view.target, VIEW_FOV, aspect)!
    const r = allowedRect({ w: 32, d: 32 }, view, aspect, safe)
    expect(r.y0).toBeCloseTo(Math.max(-1, Math.min(safe.y0, plate.y0)))
    expect(r.x1).toBeCloseTo(Math.min(1, Math.max(safe.x1, plate.x1)))
    expect(r.y1).toBe(safe.y1)
    // Zoomed right in, the plate fills more than the screen: the screen is the limit.
    const close: View = { target: view.target, position: [view.target[0] + 4, 6, view.target[2] + 6] }
    expect(allowedRect({ w: 32, d: 32 }, close, aspect, safe)).toEqual({ x0: -1, y0: -1, x1: 1, y1: 1 })
  })
})

describe('guidedFrame', () => {
  for (const [screen, { aspect, safe }] of Object.entries(IPAD)) {
    it(`${screen}: keeps the usual view for the first step of every template`, () => {
      for (const t of TEMPLATES) {
        expect(sameView(guidedFrame(t.baseplate, stepsBox(t, 1), aspect, safe), defaultView(t.baseplate)), t.id).toBe(true)
      }
    })
    it(`${screen}: backs off around the lifted plate centre to show a whole skyscraper`, () => {
      const t = getTemplate('skyscraper')!
      const box = bounds(t.bricks)!
      const v = guidedFrame(t.baseplate, box, aspect, safe)
      expect(v.target).toEqual([8, platesToWorld(box.maxY) / 2, 8])
      for (let i = 0; i < 3; i++) expect(dirOf(v)[i]).toBeCloseTo(dirOf(defaultView(t.baseplate))[i], 6)
      const shown = projectBounds(framePoints(t.baseplate, box), v.position, v.target, VIEW_FOV, aspect)!
      expect(rectInside(shown, safe, 1e-3)).toBe(true)
    })
  }
  it('keeps the usual view for finished flat buildings (iPad landscape, both modes)', () => {
    for (const { aspect, safe } of [IPAD.landscapeNormal, IPAD.landscapeEasy]) {
      for (const id of ['house_small', 'house_blue', 'restaurant', 'garage', 'police_station', 'police_hq', 'fire_station', 'car', 'bench']) {
        const t = getTemplate(id)!
        expect(sameView(guidedFrame(t.baseplate, bounds(t.bricks), aspect, safe), defaultView(t.baseplate)), id).toBe(true)
      }
    }
  })
})

describe('stepRefit', () => {
  const { aspect, safe } = IPAD.landscapeNormal
  const stepBox = (t: Template, s: number) => bounds(t.steps[s].map((i) => t.bricks[i]))
  const scaled = (v: View, k: number): View => ({ target: v.target, position: v.position.map((p, i) => v.target[i] + (p - v.target[i]) * k) as Vec3 })

  it('leaves a player who zoomed in alone while the next step is visible', () => {
    const t = getTemplate('house_small')!
    const zoomed = scaled(defaultView(t.baseplate), 0.6)
    // Steps 1-10 (furniture and the first wall courses) all stay on screen at 0.6x: no move at all.
    for (let s = 1; s <= 10; s++) expect(stepRefit(t.baseplate, stepBox(t, s), zoomed, aspect, safe), `step ${s}`).toBeNull()
  })

  it('brings the roof into a zoomed-in view with the smallest move, never past the usual view', () => {
    const t = getTemplate('house_small')!
    const usual = defaultView(t.baseplate)
    const zoomed = scaled(usual, 0.6)
    const roof = stepBox(t, t.steps.length - 1)
    const next = stepRefit(t.baseplate, roof, zoomed, aspect, safe)!
    expect(next).not.toBeNull()
    expect(dist(next)).toBeGreaterThanOrEqual(dist(zoomed) - 1e-9) // here lifting the orbit point is enough
    expect(dist(next)).toBeLessThan(dist(usual))
    expect(boxVisible(roof!, next, aspect, safe)).toBe(true)
  })

  it('backs off just enough (same angles, never closer) when the next step is off screen', () => {
    const size = { w: 32, d: 32 }
    const close: View = { target: [8, 0, 8], position: [8 + 10 * 0.45, 10 * 0.7, 8 + 10 * 0.75] }
    const box = { minX: 26, minY: 0, minZ: 26, maxX: 30, maxY: 3, maxZ: 30 } // far corner from where the player looks
    expect(boxVisible(box, close, aspect, safe)).toBe(false)
    const next = stepRefit(size, box, close, aspect, safe)!
    for (let i = 0; i < 3; i++) expect(dirOf(next)[i]).toBeCloseTo(dirOf(close)[i], 6)
    expect(next.target).toEqual([8, platesToWorld(3) / 2, 8]) // stays where the player was looking, lifted to the step
    expect(dist(next)).toBeGreaterThan(dist(close))
    expect(boxVisible(box, next, aspect, safe)).toBe(true)
    // Minimal: a little closer and the step would not fit.
    const nearer = scaled(next, 0.97)
    expect(rectInside(projectBounds(boxCorners(box), nearer.position, nearer.target, VIEW_FOV, aspect)!, safe)).toBe(false)
  })

  it('only pans (lifts the orbit point) when that alone brings the step into view', () => {
    const t = getTemplate('skyscraper')!
    const v = defaultView(t.baseplate)
    const box = { minX: 3, minY: 39, minZ: 3, maxX: 13, maxY: 49, maxZ: 13 } // the third office floor
    const next = stepRefit(t.baseplate, box, v, aspect, safe)!
    expect(next).not.toBeNull()
    expect(dist(next)).toBeGreaterThanOrEqual(dist(v) - 1e-9)
    expect(boxVisible(box, next, aspect, safe)).toBe(true)
  })

  it('does nothing without a step box', () => {
    expect(stepRefit({ w: 16, d: 16 }, null, defaultView({ w: 16, d: 16 }), aspect, safe)).toBeNull()
  })

  it('walking the skyscraper from the usual view: early steps stay put, then it only moves away, each step shown', () => {
    const t = getTemplate('skyscraper')!
    let view = defaultView(t.baseplate)
    const moves: number[] = []
    for (let s = 0; s < t.steps.length; s++) {
      const next = stepRefit(t.baseplate, stepBox(t, s), view, aspect, safe)
      if (!next) continue
      moves.push(s)
      expect(dist(next)).toBeGreaterThanOrEqual(dist(view) - 1e-9)
      for (let i = 0; i < 3; i++) expect(dirOf(next)[i]).toBeCloseTo(dirOf(view)[i], 6)
      expect(boxVisible(stepBox(t, s)!, next, aspect, safe)).toBe(true)
      view = next
    }
    expect(moves.length).toBeGreaterThan(0)
    expect(moves[0]).toBeGreaterThan(10) // the lobby is built at the usual (big) size
  })

  for (const [screen, { aspect: a, safe: sf }] of Object.entries(IPAD).filter(([k]) => k.startsWith('landscape'))) {
    it(`${screen}: never moves the usual view for flat builds`, () => {
      for (const id of ['house_small', 'house_blue', 'restaurant', 'garage', 'police_station', 'police_hq', 'car', 'tree', 'bench']) {
        const t = getTemplate(id)!
        const v = defaultView(t.baseplate)
        for (let s = 0; s < t.steps.length; s++) expect(stepRefit(t.baseplate, stepBox(t, s), v, a, sf), `${id} step ${s}`).toBeNull()
      }
    })
  }
})

describe('fitDistance', () => {
  it('finds the closest distance that fits the points', () => {
    const safe = { x0: -0.5, y0: -0.5, x1: 0.5, y1: 0.5 }
    const points: Vec3[] = [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]]
    const d = fitDistance(points, [5, 0, 5], DIR, 1, safe)
    const at = (k: number): Vec3 => [5 + DIR[0] * k, DIR[1] * k, 5 + DIR[2] * k]
    expect(rectInside(projectBounds(points, at(d), [5, 0, 5], VIEW_FOV, 1)!, safe, 1e-6)).toBe(true)
    expect(rectInside(projectBounds(points, at(d * 0.98), [5, 0, 5], VIEW_FOV, 1)!, safe)).toBe(false)
  })
})

describe('workshopFit', () => {
  const size = { w: 16, d: 16 }
  const safe = { x0: -0.7, y0: -0.6, x1: 0.62, y1: 0.8 }
  const plateFit = fitView(plateCorners(size), DIR, VIEW_FOV, 4 / 3, safe)
  it('frames the plate alone without a model', () => {
    expect(workshopFit(size, null, DIR, 4 / 3, safe)).toEqual(plateFit)
  })
  it('frames a house and its plate together', () => {
    const house = { minX: 4, minY: 0, minZ: 4, maxX: 12, maxY: 21, maxZ: 12 }
    expect(workshopFit(size, house, DIR, 4 / 3, safe)).toEqual(fitView(framePoints(size, house), DIR, VIEW_FOV, 4 / 3, safe))
  })
  it('keeps the plate big for a tower: backs off at most MAX_MODEL_ZOOM_OUT times, the whole plate in view', () => {
    const tower = { minX: 3, minY: 0, minZ: 3, maxX: 13, maxY: 115, maxZ: 13 }
    const v = workshopFit(size, tower, DIR, 4 / 3, safe)
    expect(dist(v)).toBeCloseTo(dist(plateFit) * MAX_MODEL_ZOOM_OUT, 6)
    expect(rectInside(projectBounds(plateCorners(size), v.position, v.target, VIEW_FOV, 4 / 3)!, safe, 1e-3)).toBe(true)
  })
})
