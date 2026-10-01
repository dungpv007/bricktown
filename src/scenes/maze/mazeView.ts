import { CELL } from '../../core/city'
import { platesToWorld } from '../../core/units'

export type Vec3 = [number, number, number]

/** A screen rectangle in normalized device coordinates (x right, y up, both -1..1). */
export interface NdcRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Wall blocks are two bricks (6 plates) tall. */
export const WALL_PLATES = 6
export const WALL_HEIGHT = platesToWorld(WALL_PLATES)

/** Camera tilt from straight down (radians): the maze reads like a map, walls still look 3D. */
export const MAZE_TILT = 0.5

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Camera looking north (towards -Z) from the south, `tilt` radians from straight down. Basis
 * vectors: right (+X), up on screen, forward (from the camera towards the target).
 */
function basis(tilt: number) {
  const f: Vec3 = [0, -Math.cos(tilt), -Math.sin(tilt)]
  const r: Vec3 = [1, 0, 0]
  const u: Vec3 = [0, Math.sin(tilt), -Math.cos(tilt)] // r x f: up on screen is north and up
  return { f, r, u }
}

function bounds(points: Vec3[], position: Vec3, tilt: number, tanHalf: number, aspect: number): NdcRect | null {
  const { f, r, u } = basis(tilt)
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

/** The floor corners and the wall tops of a `w` x `h` cell maze (x in [0, w*CELL], z in [0, h*CELL]). */
export function mazeCorners(w: number, h: number): Vec3[] {
  const out: Vec3[] = []
  for (const x of [0, w * CELL]) for (const z of [0, h * CELL]) for (const y of [0, WALL_HEIGHT]) out.push([x, y, z])
  return out
}

/**
 * Camera framing that shows the whole maze as large as possible inside `safe` (the part of the
 * screen the HUD leaves free), seen from the south at `tilt`. The target is on the ground.
 */
export function frameMaze(
  w: number,
  h: number,
  aspect: number,
  fovDeg: number,
  safe: NdcRect,
  tilt = MAZE_TILT,
): { target: Vec3; position: Vec3; distance: number } {
  const points = mazeCorners(w, h)
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360)
  const toCamera: Vec3 = [0, Math.cos(tilt), Math.sin(tilt)]
  const at = (target: Vec3, d: number): Vec3 => [target[0], target[1] + toCamera[1] * d, target[2] + toCamera[2] * d]
  const safeW = safe.x1 - safe.x0
  const safeH = safe.y1 - safe.y0

  const fitDistance = (target: Vec3) => {
    let lo = 1
    let hi = 5000
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const b = bounds(points, at(target, mid), tilt, tanHalf, aspect)
      if (b && b.x1 - b.x0 <= safeW && b.y1 - b.y0 <= safeH) hi = mid
      else lo = mid
    }
    return hi
  }

  let target: Vec3 = [(w * CELL) / 2, 0, (h * CELL) / 2]
  let distance = fitDistance(target)
  // Perspective couples centring and sizing: alternate until both settle.
  for (let i = 0; i < 12; i++) {
    const b = bounds(points, at(target, distance), tilt, tanHalf, aspect)
    if (!b) break
    const dx = (b.x0 + b.x1) / 2 - (safe.x0 + safe.x1) / 2
    const dy = (b.y0 + b.y1) / 2 - (safe.y0 + safe.y1) / 2
    // Moving the target east moves the picture left; moving it north (-Z) moves the picture down.
    target = [target[0] + dx * distance * tanHalf * aspect, 0, target[2] - (dy * distance * tanHalf) / Math.cos(tilt)]
    distance = fitDistance(target)
  }
  return { target, position: at(target, distance), distance }
}
