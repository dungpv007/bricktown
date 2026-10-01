import { bounds } from './model'
import { getPart } from './parts/catalog'
import { brickCenter, footprint } from './rotation'
import type { Brick } from './types'
import { platesToWorld } from './units'

export interface VehicleConfig {
  /** World units, relative to `origin`. Built from the non-wheel bricks (all bricks as fallback). */
  chassis: { halfExtents: [number, number, number]; center: [number, number, number] }
  /** Positions are relative to `origin`. */
  wheels: Array<{ position: [number, number, number]; radius: number; steer: boolean; width: number }>
  mass: number
  /** Rigid-body origin in model space: center of the full bounds in x/z, ground level in y. */
  origin: [number, number, number]
}

export type VehicleAnalysis =
  | { ok: true; config: VehicleConfig }
  | { ok: false; reason: 'no_wheels' | 'one_axle' }

const STEER_TOLERANCE = 0.5
const MASS_PER_BRICK = 0.2
const MIN_MASS = 2

export const isWheel = (brick: Brick): boolean => getPart(brick.p).tags?.includes('wheel') ?? false

export function analyzeVehicle(bricks: Brick[]): VehicleAnalysis {
  const wheelBricks = bricks.filter(isWheel)
  if (wheelBricks.length === 0) return { ok: false, reason: 'no_wheels' }

  // Forward is -Z, so the front axle is the one with the smallest Z.
  const centers = wheelBricks.map(brickCenter)
  const frontZ = Math.min(...centers.map((c) => c[2]))
  if (!centers.some((c) => c[2] - frontZ > STEER_TOLERANCE)) return { ok: false, reason: 'one_axle' }

  const full = bounds(bricks)!
  const origin: [number, number, number] = [(full.minX + full.maxX) / 2, 0, (full.minZ + full.maxZ) / 2]

  const body = bricks.filter((b) => !isWheel(b))
  const cb = bounds(body.length > 0 ? body : bricks)!
  const minY = platesToWorld(cb.minY)
  const maxY = platesToWorld(cb.maxY)
  const chassis: VehicleConfig['chassis'] = {
    halfExtents: [(cb.maxX - cb.minX) / 2, (maxY - minY) / 2, (cb.maxZ - cb.minZ) / 2],
    center: [(cb.minX + cb.maxX) / 2 - origin[0], (minY + maxY) / 2, (cb.minZ + cb.maxZ) / 2 - origin[2]],
  }

  const wheels = wheelBricks.map((brick, i): VehicleConfig['wheels'][number] => {
    const c = centers[i]!
    const part = getPart(brick.p)
    return {
      position: [c[0] - origin[0], c[1], c[2] - origin[2]],
      radius: platesToWorld(part.h) / 2,
      steer: c[2] - frontZ <= STEER_TOLERANCE,
      width: footprint(part, brick.r).fx,
    }
  })

  return {
    ok: true,
    config: { chassis, wheels, mass: Math.max(MIN_MASS, bricks.length * MASS_PER_BRICK), origin },
  }
}
