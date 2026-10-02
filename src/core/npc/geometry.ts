import { CELL } from '../city'

/**
 * Shapes the NPCs move along, in studs: car lanes through one road cell, and polylines through the
 * cells of a rail line. Pure and allocation-free to sample (results go into a caller's object).
 */

/** Travel directions, as in core/roads: 0 = N (-Z), 1 = E (+X), 2 = S (+Z), 3 = W (-X). */
export type Dir = 0 | 1 | 2 | 3

export const DX: readonly number[] = [0, 1, 0, -1]
export const DZ: readonly number[] = [-1, 0, 1, 0]

export const opposite = (d: Dir): Dir => ((d + 2) & 3) as Dir
/** The direction on your right when travelling `d` (seen from above, N up): N -> E, E -> S... */
export const rightOf = (d: Dir): Dir => ((d + 1) & 3) as Dir
export const leftOf = (d: Dir): Dir => ((d + 3) & 3) as Dir

/** The direction from cell a to its 4-neighbour b (-1 when they are not neighbours). */
export function dirBetween(ax: number, az: number, bx: number, bz: number): Dir | -1 {
  for (let d = 0; d < 4; d++) if (ax + DX[d] === bx && az + DZ[d] === bz) return d as Dir
  return -1
}

export const HALF = CELL / 2
/**
 * Vietnam drives on the right: a car's centre runs this far right of the road's centre line. The
 * asphalt between the sidewalks is 5.5 studs wide, so a car up to ~2.5 studs wide fits its lane.
 */
export const LANE = 1.35

/** A sampled pose: position (studs) and unit heading on the ground plane. */
export interface Pose {
  x: number
  z: number
  hx: number
  hz: number
}

export const newPose = (): Pose => ({ x: 0, z: 0, hx: 0, hz: -1 })

/** A sampled curve: points, and the distance along the curve at each point. */
export interface Polyline {
  xs: Float64Array
  zs: Float64Array
  /** Cumulative length at each point (0 at the first). */
  cum: Float64Array
  length: number
}

function polyline(xs: number[], zs: number[]): Polyline {
  const cum = new Float64Array(xs.length)
  for (let i = 1; i < xs.length; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1])
  return { xs: Float64Array.from(xs), zs: Float64Array.from(zs), cum, length: cum[cum.length - 1] ?? 0 }
}

/** The pose at distance `u` along `line` (clamped to its ends), into `out`. */
export function polylinePose(line: Polyline, u: number, out: Pose): Pose {
  const { xs, zs, cum } = line
  const last = cum.length - 1
  if (last < 1) {
    out.x = xs[0] ?? 0
    out.z = zs[0] ?? 0
    return out
  }
  const t = u <= 0 ? 0 : u >= line.length ? line.length : u
  // Binary search for the segment [i, i + 1] holding t.
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= t) lo = mid
    else hi = mid
  }
  const seg = cum[hi] - cum[lo]
  const f = seg > 0 ? (t - cum[lo]) / seg : 0
  const dx = xs[hi] - xs[lo]
  const dz = zs[hi] - zs[lo]
  out.x = xs[lo] + dx * f
  out.z = zs[lo] + dz * f
  const len = Math.hypot(dx, dz)
  if (len > 0) {
    out.hx = dx / len
    out.hz = dz / len
  }
  return out
}

const LANE_SAMPLES = 16
/** Bezier handle length for a quarter circle, per unit radius. */
const KAPPA = 0.5523

/**
 * A car's path through one road cell, entering while heading `din` and leaving heading `dout`, in
 * the cell's own frame (origin at its centre). It starts in the right-hand lane at the side it
 * enters by and ends in the right-hand lane of the side it leaves by: a straight, a tight right
 * turn, a wide left turn, or a U-turn (dout = opposite of din, a dead end) back out the way it came.
 */
function buildLaneCurve(din: Dir, dout: Dir): Polyline {
  const r0 = rightOf(din)
  const r1 = rightOf(dout)
  const p0x = -DX[din] * HALF + DX[r0] * LANE
  const p0z = -DZ[din] * HALF + DZ[r0] * LANE
  const p3x = DX[dout] * HALF + DX[r1] * LANE
  const p3z = DZ[dout] * HALF + DZ[r1] * LANE
  let k: number
  if (dout === din) k = (2 * HALF) / 3
  else if (dout === r0) k = KAPPA * (HALF - LANE)
  else if (dout === leftOf(din)) k = KAPPA * (HALF + LANE)
  else k = HALF * 1.2 // U-turn: loops in towards the cell centre and back
  const p1x = p0x + DX[din] * k
  const p1z = p0z + DZ[din] * k
  const p2x = p3x - DX[dout] * k
  const p2z = p3z - DZ[dout] * k
  const xs: number[] = []
  const zs: number[] = []
  for (let i = 0; i <= LANE_SAMPLES; i++) {
    const t = i / LANE_SAMPLES
    const a = (1 - t) ** 3
    const b = 3 * (1 - t) ** 2 * t
    const c = 3 * (1 - t) * t * t
    const d = t ** 3
    xs.push(a * p0x + b * p1x + c * p2x + d * p3x)
    zs.push(a * p0z + b * p1z + c * p2z + d * p3z)
  }
  return polyline(xs, zs)
}

const LANE_CURVES: Polyline[] = []
for (let din = 0; din < 4; din++) for (let dout = 0; dout < 4; dout++) LANE_CURVES.push(buildLaneCurve(din as Dir, dout as Dir))

/** The shared lane curve for entering heading `din` and leaving heading `dout` (never mutate it). */
export const laneCurve = (din: Dir, dout: Dir): Polyline => LANE_CURVES[din * 4 + dout]

/** Centre of cell (cx, cz) in studs. */
export const cellCenter = (c: number): number => (c + 0.5) * CELL

/** Quarter-circle samples on a rail curve (the track tiles use a radius of HALF around a tile corner). */
const ARC_SAMPLES = 8

/**
 * The centre line of a rail line through `cells` (in path order, neighbours one after another), as
 * the track tiles draw it: straight through straights, a quarter circle of radius HALF through
 * corners. A loop goes round once and ends where it started; an open line runs from the centre of
 * its first cell to the centre of its last (where the buffer stops are).
 */
export function railPolyline(cells: ReadonlyArray<{ cx: number; cz: number }>, loop: boolean): Polyline {
  const n = cells.length
  const xs: number[] = []
  const zs: number[] = []
  const push = (x: number, z: number) => {
    const i = xs.length - 1
    if (i >= 0 && Math.abs(xs[i] - x) < 1e-9 && Math.abs(zs[i] - z) < 1e-9) return
    xs.push(x)
    zs.push(z)
  }
  const dirAt = (a: number, b: number): Dir => {
    const d = dirBetween(cells[a].cx, cells[a].cz, cells[b].cx, cells[b].cz)
    if (d === -1) throw new Error('rail path cells are not neighbours')
    return d
  }
  for (let i = 0; i < n; i++) {
    const x = cellCenter(cells[i].cx)
    const z = cellCenter(cells[i].cz)
    const hasPrev = loop || i > 0
    const hasNext = loop || i < n - 1
    const din = hasPrev ? dirAt((i - 1 + n) % n, i) : hasNext ? dirAt(i, i + 1) : 0
    const dout = hasNext ? dirAt(i, (i + 1) % n) : din
    if (!hasPrev) push(x, z)
    else push(x - DX[din] * HALF, z - DZ[din] * HALF)
    if (hasPrev && hasNext && din !== dout) {
      // Corner between the entry side and the exit side; P(t) = C + HALF (cos t (-dout) + sin t din).
      const ccx = x + (DX[dout] - DX[din]) * HALF
      const ccz = z + (DZ[dout] - DZ[din]) * HALF
      for (let k = 1; k < ARC_SAMPLES; k++) {
        const t = (k / ARC_SAMPLES) * (Math.PI / 2)
        push(ccx + HALF * (-Math.cos(t) * DX[dout] + Math.sin(t) * DX[din]), ccz + HALF * (-Math.cos(t) * DZ[dout] + Math.sin(t) * DZ[din]))
      }
    }
    if (!hasNext) push(x, z)
    else push(x + DX[dout] * HALF, z + DZ[dout] * HALF)
  }
  return polyline(xs, zs)
}
