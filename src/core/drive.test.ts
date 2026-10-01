import { describe, expect, it } from 'vitest'
import { getTemplate } from '../content/templates'
import { CELL } from './city'
import {
  analyzeDrive,
  approach,
  clampHorizontalSpeed,
  DRIVE,
  engineForce,
  placementWorldBox,
  spawnPoint,
  steerAngle,
  uprightYaw,
} from './drive'
import type { Baseplate, Brick, CityState } from './types'

const b = (id: string, p: string, x: number, y: number, z: number, r: 0 | 1 | 2 | 3 = 0): Brick => ({
  id, p, x, y, z, r, c: 0,
})

const sizeOf8 = (): Baseplate => ({ w: 8, d: 8 })

describe('analyzeDrive', () => {
  it('accepts the car template: every wheel drives, body bricks exclude the wheels', () => {
    const car = getTemplate('car')!
    const res = analyzeDrive(car.bricks)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.config.wheels).toHaveLength(4)
    expect(res.wheelBricks).toHaveLength(4)
    expect(res.bodyBricks).toHaveLength(car.bricks.length - 4)
    // wheelBricks[i] is the brick behind config.wheels[i].
    res.wheelBricks.forEach((w, i) => {
      expect(w.z + 1 - res.config.origin[2]).toBeCloseTo(res.config.wheels[i]!.position[2])
    })
  })

  it('treats odd-rotation wheels as decoration (body), not drive wheels', () => {
    const bricks = [
      b('w1', 'wheel_small', 0, 0, 0),
      b('w2', 'wheel_small', 0, 0, 6, 2),
      b('side', 'wheel_small', 3, 0, 3, 1), // axle along Z: decoration
      b('body', 'plate_4x8', 0, 5, 0),
    ]
    const res = analyzeDrive(bricks)
    if (!res.ok) throw new Error('expected ok')
    expect(res.wheelBricks.map((w) => w.id)).toEqual(['w1', 'w2'])
    expect(res.bodyBricks.map((w) => w.id).sort()).toEqual(['body', 'side'])
    expect(res.config.wheels).toHaveLength(2)
  })

  it('asks to turn the wheels when only odd-rotation wheels make the second axle', () => {
    const bricks = [
      b('w1', 'wheel_small', 0, 0, 0),
      b('w2', 'wheel_small', 3, 0, 0),
      b('w3', 'wheel_small', 0, 0, 6, 1),
      b('w4', 'wheel_small', 3, 0, 6, 3),
      b('body', 'plate_4x8', 0, 5, 0),
    ]
    expect(analyzeDrive(bricks)).toEqual({ ok: false, reason: 'wheels_sideways' })
  })

  it('asks to turn the wheels when every wheel is sideways', () => {
    const bricks = [
      b('w1', 'wheel_small', 0, 0, 0, 1),
      b('w2', 'wheel_small', 0, 0, 6, 1),
      b('body', 'plate_4x8', 0, 5, 0),
    ]
    expect(analyzeDrive(bricks)).toEqual({ ok: false, reason: 'wheels_sideways' })
  })

  it('keeps the plain reason when turning the wheels would not help', () => {
    // One axle whichever way the wheels point.
    const bricks = [b('w1', 'wheel_small', 0, 0, 0), b('w2', 'wheel_small', 3, 0, 0, 1), b('body', 'plate_4x8', 0, 5, 0)]
    expect(analyzeDrive(bricks)).toEqual({ ok: false, reason: 'one_axle' })
  })

  it('is not drivable without wheels', () => {
    expect(analyzeDrive([b('body', 'brick_2x4', 0, 0, 0)])).toEqual({ ok: false, reason: 'no_wheels' })
    // A single sideways wheel is still one axle when turned: no special hint.
    expect(analyzeDrive([b('w', 'wheel_small', 0, 0, 0, 1)])).toEqual({ ok: false, reason: 'no_wheels' })
  })

  it('drives wheels standing on a chassis plate, and rejects wheels on top of a tall body', () => {
    const onPlate = [
      b('plate', 'plate_4x8', 0, 0, 0),
      b('w1', 'wheel_small', 0, 1, 0),
      b('w2', 'wheel_small', 3, 1, 0),
      b('w3', 'wheel_small', 0, 1, 6),
      b('w4', 'wheel_small', 3, 1, 6),
    ]
    const res = analyzeDrive(onPlate)
    if (!res.ok) throw new Error(`expected ok, got ${res.reason}`)
    expect(res.config.origin[1]).toBeCloseTo(0.4)
    expect(res.bodyBricks.map((x) => x.id)).toEqual(['plate'])

    const onBrick = [b('base', 'brick_2x4', 0, 0, 0, 1), b('base2', 'brick_2x4', 0, 0, 4, 1), ...onPlate.slice(1).map((w) => ({ ...w, y: 3 }))]
    expect(analyzeDrive(onBrick)).toEqual({ ok: false, reason: 'wheels_not_lowest' })
  })

  it('treats a build with a part this version does not know as not drivable (no crash)', () => {
    const bricks = [...getTemplate('car')!.bricks, b('x', 'jetpack_9000', 0, 20, 0)]
    expect(analyzeDrive(bricks)).toEqual({ ok: false, reason: 'unknown_part' })
  })

  it('accepts every vehicle template', () => {
    for (const id of ['car', 'truck', 'police_car', 'fire_truck']) {
      expect(analyzeDrive(getTemplate(id)!.bricks).ok, id).toBe(true)
    }
  })
})

describe('spawnPoint', () => {
  const city = (roads: string[], placements: CityState['placements'] = []): CityState => ({ size: 10, roads, placements })

  it('uses the first road cell that has road ahead (-Z), facing -Z', () => {
    expect(spawnPoint(city(['3,3', '5,5', '5,4']), sizeOf8)).toEqual({ x: 5.5 * CELL, z: 5.5 * CELL })
  })

  it('falls back to the first road cell', () => {
    expect(spawnPoint(city(['3,3', '4,3']), sizeOf8)).toEqual({ x: 3.5 * CELL, z: 3.5 * CELL })
  })

  it('uses the city centre when there are no roads', () => {
    expect(spawnPoint(city([]), sizeOf8)).toEqual({ x: 5.5 * CELL, z: 5.5 * CELL })
  })

  it('moves off a building that covers the centre', () => {
    const p = spawnPoint(city([], [{ id: 'h', source: 'x', cx: 5, cz: 5, rot: 0 }]), sizeOf8)
    expect(p).not.toEqual({ x: 5.5 * CELL, z: 5.5 * CELL })
    // A neighbouring cell centre.
    const d = Math.hypot(p.x - 5.5 * CELL, p.z - 5.5 * CELL)
    expect(d).toBeCloseTo(CELL)
  })
})

describe('placementWorldBox', () => {
  const baseplate = { w: 16, d: 8 }
  const model = { min: [2, 0, 1] as [number, number, number], max: [10, 4, 7] as [number, number, number] }

  it('places an unrotated model centred on its footprint', () => {
    // 2x1 cells at (1, 2): footprint centre (16, 20); model centre offset (-8, -4).
    const box = placementWorldBox({ cx: 1, cz: 2, rot: 0 }, baseplate, model)
    expect(box.min).toEqual([10, 0, 17])
    expect(box.max).toEqual([18, 4, 23])
  })

  it('rotates a quarter turn counter-clockwise around the footprint centre', () => {
    // Rot 1 footprint: 1x2 cells, centre (12, 24). Local (x, z) -> (z, -x) relative to the model centre.
    const box = placementWorldBox({ cx: 1, cz: 2, rot: 1 }, baseplate, model)
    // Relative model box: x in [-6, 2], z in [-3, 3] -> rotated: x' = z in [-3, 3], z' = -x in [-2, 6].
    expect(box.min).toEqual([9, 0, 22])
    expect(box.max).toEqual([15, 4, 30])
  })
})

describe('engineForce', () => {
  const mass = 4
  it('scales with throttle and mass', () => {
    expect(engineForce(1, 0, mass)).toBeCloseTo(DRIVE.ENGINE_PER_MASS * mass)
    expect(engineForce(0.5, 0, mass)).toBeCloseTo(DRIVE.ENGINE_PER_MASS * mass * 0.5)
    expect(engineForce(0, 3, mass)).toBe(0)
  })
  it('reverses at half strength', () => {
    expect(engineForce(-1, 0, mass)).toBeCloseTo(-DRIVE.ENGINE_PER_MASS * mass * DRIVE.REVERSE_RATIO)
  })
  it('cuts the engine at the speed limits', () => {
    expect(engineForce(1, DRIVE.MAX_SPEED, mass)).toBe(0)
    expect(engineForce(-1, -DRIVE.MAX_REVERSE_SPEED, mass)).toBe(0)
    // Still allowed to push against the motion (slowing down).
    expect(engineForce(-1, DRIVE.MAX_SPEED, mass)).toBeLessThan(0)
  })
})

describe('steerAngle', () => {
  it('turns the wheels left (positive angle) for a left stick, right for a right stick', () => {
    expect(steerAngle(-1, 0)).toBeCloseTo(DRIVE.MAX_STEER)
    expect(steerAngle(1, 0)).toBeCloseTo(-DRIVE.MAX_STEER)
    expect(steerAngle(0, 5)).toBeCloseTo(0)
  })
  it('steers more gently at top speed', () => {
    expect(Math.abs(steerAngle(1, DRIVE.MAX_SPEED))).toBeLessThan(DRIVE.MAX_STEER)
    expect(Math.abs(steerAngle(1, DRIVE.MAX_SPEED))).toBeGreaterThan(0.2)
  })
})

describe('approach', () => {
  it('moves part of the way and never overshoots', () => {
    const v = approach(0, 1, 6, 1 / 60)
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(1)
    expect(approach(0, 1, 6, 10)).toBeCloseTo(1)
  })
})

describe('clampHorizontalSpeed', () => {
  it('leaves slow velocities alone', () => {
    expect(clampHorizontalSpeed(3, 4, 15)).toEqual([3, 4])
  })
  it('scales fast velocities down to the limit, keeping direction', () => {
    const [x, z] = clampHorizontalSpeed(30, 40, 10)
    expect(x).toBeCloseTo(6)
    expect(z).toBeCloseTo(8)
  })
})

describe('uprightYaw', () => {
  it('returns the heading of the forward vector (yaw 0 = facing -Z)', () => {
    expect(uprightYaw([0, 0, -1])).toBeCloseTo(0)
    expect(uprightYaw([-1, 0, 0])).toBeCloseTo(Math.PI / 2) // turned left
    expect(uprightYaw([1, 0, 0])).toBeCloseTo(-Math.PI / 2)
  })
  it('ignores pitch and falls back to 0 when pointing straight up', () => {
    expect(uprightYaw([0, 0.9, -0.1])).toBeCloseTo(0)
    expect(uprightYaw([0, 1, 0])).toBe(0)
  })
})
