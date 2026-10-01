import type { Bounds } from '../../core/model'
import type { Baseplate } from '../../core/types'
import { platesToWorld } from '../../core/units'

export type Vec3 = [number, number, number]

/** A screen rectangle in normalized device coordinates (x right, y up, both -1..1). */
export interface NdcRect { x0: number; y0: number; x1: number; y1: number }

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Top corners of the plate (y = 0). */
export function plateCorners({ w, d }: Baseplate): Vec3[] {
  return [[0, 0, 0], [w, 0, 0], [w, 0, d], [0, 0, d]]
}

/** The eight corners of a model's bounding box (bricks units: studs, plates) in world units. */
export function boxCorners(b: Bounds): Vec3[] {
  const out: Vec3[] = []
  for (const x of [b.minX, b.maxX]) {
    for (const y of [platesToWorld(b.minY), platesToWorld(b.maxY)]) {
      for (const z of [b.minZ, b.maxZ]) out.push([x, y, z])
    }
  }
  return out
}

/** What a view must show: the plate, plus the model on it (tall models reach far above the plate). */
export function framePoints(size: Baseplate, model: Bounds | null): Vec3[] {
  return model ? [...plateCorners(size), ...boxCorners(model)] : plateCorners(size)
}

/** Camera basis (right, up, forward) for a camera at `position` looking at `target`, world up = +Y. */
function basis(position: Vec3, target: Vec3) {
  const f = normalize(sub(target, position))
  const r = normalize(cross(f, [0, 1, 0]))
  return { f, r, u: cross(r, f) }
}

/**
 * Screen bounds (NDC) of `points` seen by a perspective camera (vertical `fovDeg`) at `position`
 * looking at `target`; null when any point is not in front of the camera.
 */
export function projectBounds(points: Vec3[], position: Vec3, target: Vec3, fovDeg: number, aspect: number): NdcRect | null {
  const { f, r, u } = basis(position, target)
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360)
  const out: NdcRect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const p of points) {
    const v = sub(p, position)
    const z = dot(v, f)
    if (z <= 0.01) return null
    const x = dot(v, r) / (z * tanHalf * aspect)
    const y = dot(v, u) / (z * tanHalf)
    out.x0 = Math.min(out.x0, x)
    out.x1 = Math.max(out.x1, x)
    out.y0 = Math.min(out.y0, y)
    out.y1 = Math.max(out.y1, y)
  }
  return out
}

export function rectInside(inner: NdcRect, outer: NdcRect, tolerance = 0): boolean {
  return (
    inner.x0 >= outer.x0 - tolerance && inner.x1 <= outer.x1 + tolerance &&
    inner.y0 >= outer.y0 - tolerance && inner.y1 <= outer.y1 + tolerance
  )
}

/**
 * Camera framing that shows all `points` as large as possible inside `safe` (the part of the screen
 * no HUD covers), looking along `dir` (unit vector from target to camera, so orbit angles are kept).
 * The orbit target stays on the ground (y = 0).
 */
export function fitView(
  points: Vec3[],
  dir: Vec3,
  fovDeg: number,
  aspect: number,
  safe: NdcRect,
): { target: Vec3; position: Vec3 } {
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360)
  const { r, u, f } = basis(dir, [0, 0, 0])
  // Moving the target along the ground "forward" moves the picture down on screen.
  const g = normalize([f[0], 0, f[2]])
  const gu = dot(g, u)
  const safeW = safe.x1 - safe.x0
  const safeH = safe.y1 - safe.y0
  const at = (target: Vec3, dist: number): Vec3 => [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist]

  /** Smallest distance at which the points' screen size fits the safe rect's size. */
  const fitDistance = (target: Vec3): number => {
    let lo = 0.5
    let hi = 4000
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const b = projectBounds(points, at(target, mid), target, fovDeg, aspect)
      if (b && b.x1 - b.x0 <= safeW && b.y1 - b.y0 <= safeH) hi = mid
      else lo = mid
    }
    return hi
  }

  const n = points.length
  let target: Vec3 = [points.reduce((s, p) => s + p[0], 0) / n, 0, points.reduce((s, p) => s + p[2], 0) / n]
  let dist = fitDistance(target)
  // Perspective makes centring and sizing interact: alternate a few times until both settle.
  for (let i = 0; i < 12; i++) {
    const b = projectBounds(points, at(target, dist), target, fovDeg, aspect)
    if (!b) break
    const dx = (b.x0 + b.x1) / 2 - (safe.x0 + safe.x1) / 2
    const dy = (b.y0 + b.y1) / 2 - (safe.y0 + safe.y1) / 2
    const sx = dx * dist * tanHalf * aspect
    const sy = gu > 1e-6 ? (dy * dist * tanHalf) / gu : 0
    target = [target[0] + r[0] * sx + g[0] * sy, 0, target[2] + r[2] * sx + g[2] * sy]
    dist = fitDistance(target)
  }
  return { target, position: at(target, dist) }
}

// ---- Framing the plate and the model on it (Workshop and Guided share these) ----

/** Vertical field of view of the Workshop and Guided cameras (degrees). */
export const VIEW_FOV = 45

export interface View { target: Vec3; position: Vec3 }

const add = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const viewDir = (v: View): Vec3 => normalize(sub(v.position, v.target))
const viewDistance = (v: View) => length(sub(v.position, v.target))

/** The usual view of a plate: from the front-right, a bit above, looking at its centre on the ground. */
export function defaultView(size: Baseplate): View {
  const dist = Math.max(size.w, size.d) * 1.5 + 8
  const target: Vec3 = [size.w / 2, 0, size.d / 2]
  return { target, position: [target[0] + dist * 0.45, dist * 0.7, target[2] + dist * 0.75] }
}

/** Top of a model in world units (0 without bricks). */
export const modelTop = (model: Bounds | null): number => (model ? platesToWorld(model.maxY) : 0)

const SCREEN: NdcRect = { x0: -1, y0: -1, x1: 1, y1: 1 }

/**
 * Where `view` may show the model without backing off: the HUD-free `safe` rect, grown to wherever
 * the plate already reaches on screen (the usual view lets a big plate run under the HUD), but never
 * past the screen edges.
 */
export function allowedRect(size: Baseplate, view: View, aspect: number, safe: NdcRect): NdcRect {
  const p = projectBounds(plateCorners(size), view.position, view.target, VIEW_FOV, aspect)
  // A plate corner behind the camera: zoomed right in, the plate runs off every edge.
  if (!p) return SCREEN
  return {
    x0: Math.max(SCREEN.x0, Math.min(safe.x0, p.x0)),
    y0: Math.max(SCREEN.y0, Math.min(safe.y0, p.y0)),
    x1: Math.min(SCREEN.x1, Math.max(safe.x1, p.x1)),
    y1: Math.min(SCREEN.y1, Math.max(safe.y1, p.y1)),
  }
}

/**
 * How far (NDC) a model may reach past the allowed rect and still count as shown: the HUD-free rect
 * already keeps a margin from the HUD, and a roof grazing it is no reason to move the camera.
 */
export const SHOW_TOLERANCE = 0.05

/** True when the whole `box` (no box: nothing to show) is inside `allowedRect` for `view` (give or take SHOW_TOLERANCE). */
export function showsModel(size: Baseplate, box: Bounds | null, view: View, aspect: number, safe: NdcRect): boolean {
  if (!box) return true
  const b = projectBounds(boxCorners(box), view.position, view.target, VIEW_FOV, aspect)
  return b !== null && rectInside(b, allowedRect(size, view, aspect, safe), SHOW_TOLERANCE)
}

/** Orbit point for a tall build: over the plate centre, half way up what is built, so zooming stays on it. */
export function liftedTarget(size: Baseplate, box: Bounds | null): Vec3 {
  return [size.w / 2, modelTop(box) / 2, size.d / 2]
}

const MAX_DISTANCE = 4000

/** Smallest distance from `target` along `dir` at which all `points` are inside `safe` (MAX_DISTANCE if none). */
export function fitDistance(points: Vec3[], target: Vec3, dir: Vec3, aspect: number, safe: NdcRect): number {
  let lo = 0.5
  let hi = MAX_DISTANCE
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const b = projectBounds(points, add(target, dir, mid), target, VIEW_FOV, aspect)
    if (b && rectInside(b, safe)) hi = mid
    else lo = mid
  }
  return hi
}

/** Looks at the lifted target along `dir`, at least `minDistance` away and far enough to show the plate and `box`. */
function backOff(size: Baseplate, box: Bounds | null, dir: Vec3, minDistance: number, aspect: number, safe: NdcRect): View {
  const target = liftedTarget(size, box)
  const dist = Math.max(minDistance, fitDistance(framePoints(size, box), target, dir, aspect, safe))
  return { target, position: add(target, dir, dist) }
}

/**
 * Guided's first framing for what is on the plate so far (`box`: placed bricks and the step's ghosts):
 * the usual view when it shows them, else backed off (same angles) around the lifted target.
 */
export function guidedFrame(size: Baseplate, box: Bounds | null, aspect: number, safe: NdcRect): View {
  const usual = defaultView(size)
  if (showsModel(size, box, usual, aspect, safe)) return usual
  return backOff(size, box, viewDir(usual), viewDistance(usual), aspect, safe)
}

/**
 * Guided, after a step or a screen change: null while `view` (the player's current camera) still
 * shows `box`, else a view that backs off along the same angles to show it. Never closer than `view`,
 * so a player's zoom is only ever undone outwards.
 */
export function guidedRefit(size: Baseplate, box: Bounds | null, view: View, aspect: number, safe: NdcRect): View | null {
  if (showsModel(size, box, view, aspect, safe)) return null
  return backOff(size, box, viewDir(view), viewDistance(view), aspect, safe)
}

/** How much further than the plate-only fit the Workshop may back off to show a tall model. */
export const MAX_MODEL_ZOOM_OUT = 1.6

/**
 * Workshop framing along `dir`: the plate and its model, but never more than MAX_MODEL_ZOOM_OUT times
 * further than the plate alone needs, so the plate (and its edge buttons) stays big. A taller model
 * keeps the plate framed and its top is cropped (the kid can orbit up).
 */
export function workshopFit(size: Baseplate, model: Bounds | null, dir: Vec3, aspect: number, safe: NdcRect): View {
  const plate = fitView(plateCorners(size), dir, VIEW_FOV, aspect, safe)
  if (!model) return plate
  const all = fitView(framePoints(size, model), dir, VIEW_FOV, aspect, safe)
  const cap = viewDistance(plate) * MAX_MODEL_ZOOM_OUT
  if (viewDistance(all) <= cap) return all
  return { target: plate.target, position: add(plate.target, dir, cap) }
}
