import { describe, expect, it } from 'vitest'
import { getTemplate } from '../content/templates'
import { bounds } from './model'
import type { Brick } from './types'
import { analyzeVehicle } from './vehicle'

const b = (id: string, p: string, x: number, y: number, z: number, r: 0 | 1 | 2 | 3 = 0): Brick => ({
  id, p, x, y, z, r, c: 0,
})

describe('analyzeVehicle', () => {
  it('analyses the car template: 4 wheels, 2 steering', () => {
    const car = getTemplate('car')!
    const res = analyzeVehicle(car.bricks)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const { config } = res
    expect(config.wheels).toHaveLength(4)
    expect(config.wheels.filter((w) => w.steer)).toHaveLength(2)
    // Front (smallest Z) wheels steer.
    const minZ = Math.min(...config.wheels.map((w) => w.position[2]))
    for (const w of config.wheels) expect(w.steer).toBe(w.position[2] === minZ)
    // wheel_small: h=5 plates -> radius 1, 1 stud wide.
    for (const w of config.wheels) {
      expect(w.radius).toBeCloseTo(1)
      expect(w.width).toBe(1)
    }
  })

  it('reports origin at the model bounds center, ground level, with positions relative to it', () => {
    const car = getTemplate('car')!
    const res = analyzeVehicle(car.bricks)
    if (!res.ok) throw new Error('expected ok')
    const bb = bounds(car.bricks)!
    const origin = [(bb.minX + bb.maxX) / 2, 0, (bb.minZ + bb.maxZ) / 2]
    expect(res.config.origin).toEqual(origin)
    // Wheel at x=2,z=4 (1x2, r0): center (2.5, 1, 5) -> relative to origin.
    const first = res.config.wheels.find((w) => w.position[0] === 2.5 - origin[0] && w.position[2] === 5 - origin[2])
    expect(first).toBeDefined()
    expect(first!.position[1]).toBeCloseTo(1)
  })

  it('builds a sane chassis box and mass', () => {
    const car = getTemplate('car')!
    const res = analyzeVehicle(car.bricks)
    if (!res.ok) throw new Error('expected ok')
    const { chassis, mass } = res.config
    for (const h of chassis.halfExtents) expect(h).toBeGreaterThan(0)
    // Chassis covers non-wheel bricks only: plates 5..15 -> y 2.0..6.0, center 4.0, half 2.0.
    const nonWheel = car.bricks.filter((br) => !br.p.startsWith('wheel'))
    const cb = bounds(nonWheel)!
    expect(chassis.halfExtents[1]).toBeCloseTo(((cb.maxY - cb.minY) * 0.4) / 2)
    expect(chassis.center[1]).toBeCloseTo(((cb.maxY + cb.minY) * 0.4) / 2)
    expect(chassis.halfExtents[0]).toBeCloseTo((cb.maxX - cb.minX) / 2)
    expect(mass).toBeCloseTo(Math.max(2, car.bricks.length * 0.2))
  })

  it('returns no_wheels without wheels', () => {
    expect(analyzeVehicle([b('a', 'brick_2x4', 0, 0, 0)])).toEqual({ ok: false, reason: 'no_wheels' })
    expect(analyzeVehicle([])).toEqual({ ok: false, reason: 'no_wheels' })
  })

  it('returns one_axle when all wheels share one Z row (or only one wheel)', () => {
    const row = [
      b('w1', 'wheel_small', 0, 0, 0),
      b('w2', 'wheel_small', 4, 0, 0),
      b('c', 'plate_2x4', 0, 5, 0),
    ]
    expect(analyzeVehicle(row)).toEqual({ ok: false, reason: 'one_axle' })
    expect(analyzeVehicle([b('w1', 'wheel_small', 0, 0, 0)])).toEqual({ ok: false, reason: 'one_axle' })
  })

  it('applies the minimum mass of 2 and falls back to all bricks for the chassis', () => {
    const res = analyzeVehicle([
      b('w1', 'wheel_small', 0, 0, 0),
      b('w2', 'wheel_small', 0, 0, 4),
    ])
    if (!res.ok) throw new Error('expected ok')
    expect(res.config.mass).toBe(2)
    expect(res.config.chassis.halfExtents[1]).toBeCloseTo(1) // 5 plates = 2.0 tall
    expect(res.config.chassis.center[1]).toBeCloseTo(1)
  })

  it('uses the footprint along X as wheel width when rotated', () => {
    const res = analyzeVehicle([
      b('w1', 'wheel_small', 0, 0, 0, 1),
      b('w2', 'wheel_small', 0, 0, 4, 1),
    ])
    if (!res.ok) throw new Error('expected ok')
    expect(res.config.wheels.map((w) => w.width)).toEqual([2, 2])
  })
})
