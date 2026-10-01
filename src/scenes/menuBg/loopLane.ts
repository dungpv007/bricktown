/**
 * A closed driving lane: the rectangle `x0..x1` by `z0..z1` (studs) with rounded corners, driven
 * clockwise seen from above (+X, then +Z, then -X, then -Z), which keeps a car on the right-hand
 * side of a road loop when the lane runs just inside the road's centre line.
 */
export interface LoopLane {
  x0: number
  z0: number
  x1: number
  z1: number
  /** Corner radius; at most half the shorter side. */
  radius: number
}

/** Where a car is: position on the ground and the Y rotation that turns a model facing -Z along the lane. */
export interface LanePose {
  x: number
  z: number
  yaw: number
}

const QUARTER = Math.PI / 2

export function laneLength(lane: LoopLane): number {
  const { x0, z0, x1, z1, radius: r } = lane
  return 2 * (x1 - x0 - 2 * r) + 2 * (z1 - z0 - 2 * r) + 2 * Math.PI * r
}

/** Yaw of a model facing -Z when it heads along angle `psi` (direction (cos psi, sin psi) in x, z). */
const yawOf = (psi: number) => Math.atan2(-Math.cos(psi), -Math.sin(psi))

/** The pose `s` studs along the lane from the start of its top edge; wraps around in both directions. */
export function lanePose(lane: LoopLane, s: number): LanePose {
  const { x0, z0, x1, z1, radius: r } = lane
  const w = x1 - x0 - 2 * r
  const d = z1 - z0 - 2 * r
  // Side k heads along angle k * 90deg and is followed by the corner turning to the next side.
  const sides: Array<{ length: number; start: [number, number]; corner: [number, number] }> = [
    { length: w, start: [x0 + r, z0], corner: [x1 - r, z0 + r] },
    { length: d, start: [x1, z0 + r], corner: [x1 - r, z1 - r] },
    { length: w, start: [x1 - r, z1], corner: [x0 + r, z1 - r] },
    { length: d, start: [x0, z1 - r], corner: [x0 + r, z0 + r] },
  ]
  const arc = QUARTER * r
  const total = laneLength(lane)
  let left = ((s % total) + total) % total
  for (let k = 0; k < 4; k++) {
    const { length, start, corner } = sides[k]
    const psi = k * QUARTER
    if (left <= length) {
      return { x: start[0] + Math.cos(psi) * left, z: start[1] + Math.sin(psi) * left, yaw: yawOf(psi) }
    }
    left -= length
    if (left <= arc || k === 3) {
      const turn = psi + Math.min(left, arc) / r
      // On a right-hand turn the centre lies to the right of the heading.
      return { x: corner[0] + r * Math.sin(turn), z: corner[1] - r * Math.cos(turn), yaw: yawOf(turn) }
    }
    left -= arc
  }
  throw new Error('unreachable')
}
