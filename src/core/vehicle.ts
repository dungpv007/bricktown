import { bounds } from './model'
import { getPart } from './parts/catalog'
import { brickCenter, footprint } from './rotation'
import type { Brick } from './types'
import { platesToWorld } from './units'

export interface VehicleConfig {
  /**
   * World units, relative to `origin`. Spans the non-wheel bricks (all bricks as fallback) in x/z;
   * in y it starts `CHASSIS_CLEARANCE` above the wheel bottoms, so a chassis plate the wheels stand
   * on never drags on the ground.
   */
  chassis: { halfExtents: [number, number, number]; center: [number, number, number] }
  /** Positions are relative to `origin`. */
  wheels: Array<{ position: [number, number, number]; radius: number; steer: boolean; width: number }>
  mass: number
  /**
   * Rigid-body origin in model space: center of the full bounds in x/z, the bottom of the lowest
   * wheel in y (where the ground is once the car stands on its wheels).
   */
  origin: [number, number, number]
}

export type VehicleProblem = 'no_wheels' | 'one_axle' | 'wheels_not_lowest'

export type VehicleAnalysis = { ok: true; config: VehicleConfig } | { ok: false; reason: VehicleProblem }

const STEER_TOLERANCE = 0.5
const MASS_PER_BRICK = 0.2
const MIN_MASS = 2
/** Gap between the wheel bottoms and the chassis collider (world units). */
export const CHASSIS_CLEARANCE = 0.2
/** The chassis collider is at least one plate tall, even over a flat plate the wheels stand on. */
const MIN_CHASSIS_HEIGHT = platesToWorld(1)
/**
 * How far non-wheel bricks may reach below the wheel bottoms: one chassis plate (it sinks into the
 * road). Deeper, the car would be half buried, so it is not drivable.
 */
export const MAX_BODY_BELOW_WHEELS = platesToWorld(1)
const EPS = 1e-6

export const isWheel = (brick: Brick): boolean => getPart(brick.p).tags?.includes('wheel') ?? false

const wheelRadius = (brick: Brick): number => platesToWorld(getPart(brick.p).h) / 2

export function analyzeVehicle(bricks: Brick[]): VehicleAnalysis {
  const wheelBricks = bricks.filter(isWheel)
  if (wheelBricks.length === 0) return { ok: false, reason: 'no_wheels' }

  // Forward is -Z, so the front axle is the one with the smallest Z.
  const centers = wheelBricks.map(brickCenter)
  const frontZ = Math.min(...centers.map((c) => c[2]))
  if (!centers.some((c) => c[2] - frontZ > STEER_TOLERANCE)) return { ok: false, reason: 'one_axle' }

  // The car stands on its lowest wheel bottoms: that height becomes the ground (origin y).
  const groundY = Math.min(...wheelBricks.map((brick, i) => centers[i]![1] - wheelRadius(brick)))
  const body = bricks.filter((b) => !isWheel(b))
  const cb = bounds(body.length > 0 ? body : bricks)!
  const bodyMin = platesToWorld(cb.minY)
  if (groundY - bodyMin > MAX_BODY_BELOW_WHEELS + EPS) return { ok: false, reason: 'wheels_not_lowest' }

  const full = bounds(bricks)!
  const origin: [number, number, number] = [(full.minX + full.maxX) / 2, groundY, (full.minZ + full.maxZ) / 2]

  const bottom = Math.max(bodyMin - groundY, CHASSIS_CLEARANCE)
  const top = Math.max(platesToWorld(cb.maxY) - groundY, bottom + MIN_CHASSIS_HEIGHT)
  const chassis: VehicleConfig['chassis'] = {
    halfExtents: [(cb.maxX - cb.minX) / 2, (top - bottom) / 2, (cb.maxZ - cb.minZ) / 2],
    center: [(cb.minX + cb.maxX) / 2 - origin[0], (bottom + top) / 2, (cb.minZ + cb.maxZ) / 2 - origin[2]],
  }

  const wheels = wheelBricks.map((brick, i): VehicleConfig['wheels'][number] => {
    const c = centers[i]!
    return {
      position: [c[0] - origin[0], c[1] - groundY, c[2] - origin[2]],
      radius: wheelRadius(brick),
      steer: c[2] - frontZ <= STEER_TOLERANCE,
      width: footprint(getPart(brick.p), brick.r).fx,
    }
  })

  return {
    ok: true,
    config: { chassis, wheels, mass: Math.max(MIN_MASS, bricks.length * MASS_PER_BRICK), origin },
  }
}
