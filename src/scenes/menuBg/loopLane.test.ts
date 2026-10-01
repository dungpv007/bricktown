import { describe, expect, it } from 'vitest'
import { laneLength, lanePose, type LoopLane } from './loopLane'

const lane: LoopLane = { x0: 0, z0: 0, x1: 40, z1: 20, radius: 4 }

/** Direction a model facing -Z points to after turning by `yaw` around +Y. */
const facing = (yaw: number) => [-Math.sin(yaw), -Math.cos(yaw)]

describe('loop lane', () => {
  it('measures the rounded rectangle', () => {
    expect(laneLength(lane)).toBeCloseTo(2 * 32 + 2 * 12 + 2 * Math.PI * 4)
  })

  it('starts on the top edge heading +X (clockwise seen from above)', () => {
    const p = lanePose(lane, 0)
    expect(p.x).toBeCloseTo(4)
    expect(p.z).toBeCloseTo(0)
    const [dx, dz] = facing(p.yaw)
    expect(dx).toBeCloseTo(1)
    expect(dz).toBeCloseTo(0)
  })

  it('goes down the right edge (+Z), then back along the bottom (-X)', () => {
    const right = lanePose(lane, 32 + Math.PI * 2 + 6) // top straight + quarter arc + 6
    expect(right.x).toBeCloseTo(40)
    expect(right.z).toBeCloseTo(10)
    expect(facing(right.yaw)[1]).toBeCloseTo(1)

    const bottom = lanePose(lane, 32 + 12 + 2 * Math.PI * 2 + 16)
    expect(bottom.x).toBeCloseTo(20)
    expect(bottom.z).toBeCloseTo(20)
    expect(facing(bottom.yaw)[0]).toBeCloseTo(-1)
  })

  it('wraps around and moves smoothly (no jumps, heading along the motion)', () => {
    const total = laneLength(lane)
    const a = lanePose(lane, total + 3)
    const b = lanePose(lane, 3)
    expect(a.x).toBeCloseTo(b.x)
    expect(a.z).toBeCloseTo(b.z)
    expect(lanePose(lane, -1).x).toBeCloseTo(lanePose(lane, total - 1).x)

    const step = 0.1
    for (let s = 0; s < total; s += step) {
      const p = lanePose(lane, s)
      const q = lanePose(lane, s + step)
      const moved = Math.hypot(q.x - p.x, q.z - p.z)
      expect(moved).toBeLessThanOrEqual(step + 1e-6)
      expect(moved).toBeGreaterThan(step * 0.9)
      const [dx, dz] = facing(p.yaw)
      expect(((q.x - p.x) * dx + (q.z - p.z) * dz) / moved).toBeGreaterThan(0.99)
    }
  })
})
