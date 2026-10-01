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
