import { CELL, footprintCells } from './city'
import { placementCenter } from './cityPlan'
import { roadKey } from './roads'
import type { Baseplate, Brick, CityPlacement, CityState } from './types'
import { analyzeVehicle, isWheel, type VehicleConfig } from './vehicle'

/**
 * Pure helpers for Drive mode: which bricks drive, where the car starts, the city's collision
 * boxes and the kid-friendly handling numbers. World units (studs); forward is -Z.
 */

export const DRIVE = {
  /** Forward speed limit (studs / s). */
  MAX_SPEED: 15,
  MAX_REVERSE_SPEED: 7,
  /** Total engine force at full throttle, per unit of vehicle mass (= acceleration, studs / s^2). */
  ENGINE_PER_MASS: 12,
  REVERSE_RATIO: 0.5,
  /** Front wheel angle at full stick (radians). */
  MAX_STEER: 0.5,
  /** Fraction of the steering kept at top speed (gentler turns when fast). */
  STEER_AT_SPEED: 0.55,
} as const

/** A wheel brick turned 0 or 2 quarter turns: its axle runs along X, so it can roll forward. */
export const isDriveWheel = (brick: Brick): boolean => isWheel(brick) && brick.r % 2 === 0

export type DriveAnalysis =
  | {
      ok: true
      config: VehicleConfig
      /** `wheelBricks[i]` is the brick drawn for `config.wheels[i]`. */
      wheelBricks: Brick[]
      /** Everything else, drawn as one piece with the chassis (sideways wheels are decoration). */
      bodyBricks: Brick[]
    }
  | { ok: false; reason: 'no_wheels' | 'one_axle' }

/** `analyzeVehicle` on the drivable wheels only: sideways (odd-rotation) wheels are decoration. */
export function analyzeDrive(bricks: Brick[]): DriveAnalysis {
  const physical = bricks.filter((b) => !isWheel(b) || isDriveWheel(b))
  const res = analyzeVehicle(physical)
  if (!res.ok) return res
  return {
    ok: true,
    config: res.config,
    wheelBricks: physical.filter(isWheel),
    bodyBricks: bricks.filter((b) => !isDriveWheel(b)),
  }
}

type SizeOf = (source: string) => Baseplate

const cellCenter = (cx: number, cz: number) => ({ x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL })

/**
 * Where the car starts (facing -Z): the first road cell with road ahead of it, else the first
 * road cell, else the free cell nearest the city centre.
 */
export function spawnPoint(city: CityState, sizeOf: SizeOf): { x: number; z: number } {
  const cells = city.roads.map((key) => key.split(',').map(Number) as [number, number])
  if (cells.length > 0) {
    const roads = new Set(city.roads)
    const ahead = cells.find(([cx, cz]) => roads.has(roadKey(cx, cz - 1)))
    const [cx, cz] = ahead ?? cells[0]
    return cellCenter(cx, cz)
  }

  const covered = new Set<string>()
  for (const p of city.placements) {
    const { cw, cd } = footprintCells(sizeOf(p.source), p.rot)
    for (let x = p.cx; x < p.cx + cw; x++) for (let z = p.cz; z < p.cz + cd; z++) covered.add(roadKey(x, z))
  }
  const mid = Math.floor(city.size / 2)
  let best: [number, number] = [mid, mid]
  let bestDist = Infinity
  for (let cx = 0; cx < city.size; cx++) {
    for (let cz = 0; cz < city.size; cz++) {
      if (covered.has(roadKey(cx, cz))) continue
      const d = (cx - mid) ** 2 + (cz - mid) ** 2
      if (d < bestDist) {
        bestDist = d
        best = [cx, cz]
      }
    }
  }
  return cellCenter(best[0], best[1])
}

export interface Box {
  min: [number, number, number]
  max: [number, number, number]
}

// cos/sin of r quarter turns, exact.
const COS = [1, 0, -1, 0] as const
const SIN = [0, 1, 0, -1] as const

/**
 * World AABB of a placed model, given its model-space bounding box. Matches `placementMatrix`:
 * the model is turned `rot` quarter turns (counter-clockwise) around its baseplate centre and
 * centred on its footprint cells.
 */
export function placementWorldBox(
  p: Pick<CityPlacement, 'cx' | 'cz' | 'rot'>,
  baseplate: Baseplate,
  model: Box,
): Box {
  const { x: wx, z: wz } = placementCenter(p, baseplate)
  const cos = COS[p.rot]
  const sin = SIN[p.rot]
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const mx of [model.min[0], model.max[0]]) {
    for (const mz of [model.min[2], model.max[2]]) {
      const lx = mx - baseplate.w / 2
      const lz = mz - baseplate.d / 2
      const x = lx * cos + lz * sin + wx
      const z = -lx * sin + lz * cos + wz
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
  }
  return { min: [minX, model.min[1], minZ], max: [maxX, model.max[1], maxZ] }
}

/**
 * Total engine force for a throttle in [-1, 1] at the current forward speed (negative = backwards).
 * Reverse is half strength; the engine stops pushing past the speed limit in that direction.
 */
export function engineForce(throttle: number, forwardSpeed: number, mass: number): number {
  if (throttle > 0 && forwardSpeed >= DRIVE.MAX_SPEED) return 0
  if (throttle < 0 && forwardSpeed <= -DRIVE.MAX_REVERSE_SPEED) return 0
  const ratio = throttle < 0 ? DRIVE.REVERSE_RATIO : 1
  return throttle * ratio * DRIVE.ENGINE_PER_MASS * mass
}

/**
 * Front wheel angle for a stick value in [-1, 1] (right = +1). Rapier turns the wheel left for a
 * positive angle. Turns are gentler at speed.
 */
export function steerAngle(steer: number, forwardSpeed: number): number {
  const fast = Math.min(1, Math.abs(forwardSpeed) / DRIVE.MAX_SPEED)
  const scale = 1 - (1 - DRIVE.STEER_AT_SPEED) * fast
  return -steer * DRIVE.MAX_STEER * scale
}

/** Frame-rate independent smoothing of `current` towards `target` (`rate` per second). */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

/** Scales a horizontal velocity down to at most `max`, keeping its direction. */
export function clampHorizontalSpeed(vx: number, vz: number, max: number): [number, number] {
  const speed = Math.hypot(vx, vz)
  if (speed <= max) return [vx, vz]
  const k = max / speed
  return [vx * k, vz * k]
}

/**
 * Heading (rotation around +Y) of a forward vector, 0 = facing -Z. Used to put a tipped-over car
 * back on its wheels facing the same way; 0 when the nose points straight up or down.
 */
export function uprightYaw(forward: [number, number, number]): number {
  const [fx, , fz] = forward
  if (Math.hypot(fx, fz) < 1e-3) return 0
  return Math.atan2(-fx, -fz)
}
