import { CELL, drawScale, placementCells } from './city'
import { placementCenter } from './cityPlan'
import { roadKey } from './roads'
import { QUARTER_COS, QUARTER_SIN } from './rotation'
import type { Baseplate, Brick, CityPlacement, CityState } from './types'
import { PART_BY_ID } from './parts/catalog'
import { analyzeVehicle, isWheel, type VehicleConfig, type VehicleProblem } from './vehicle'

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

/** How far the front wheels turn: at full stick when slow, and the fraction of that kept at top speed. */
export interface SteerTuning {
  MAX_STEER: number
  STEER_AT_SPEED: number
}

/** A wheel brick turned 0 or 2 quarter turns: its axle runs along X, so it can roll forward. */
export const isDriveWheel = (brick: Brick): boolean => isWheel(brick) && brick.r % 2 === 0

/**
 * Why a build cannot drive. On top of the `analyzeVehicle` problems: `wheels_sideways` when turning
 * the odd-rotation wheels would fix it, `unknown_part` when it uses a part this version lacks.
 */
export type DriveProblem = VehicleProblem | 'wheels_sideways' | 'unknown_part'

export type DriveAnalysis =
  | {
      ok: true
      config: VehicleConfig
      /** `wheelBricks[i]` is the brick drawn for `config.wheels[i]`. */
      wheelBricks: Brick[]
      /** Everything else, drawn as one piece with the chassis (sideways wheels are decoration). */
      bodyBricks: Brick[]
    }
  | { ok: false; reason: DriveProblem }

/**
 * `analyzeVehicle` on the drivable wheels only: sideways (odd-rotation) wheels are decoration.
 * Never throws: a build with an unknown part id is simply not drivable.
 */
export function analyzeDrive(bricks: Brick[]): DriveAnalysis {
  if (!bricks.every((b) => Object.hasOwn(PART_BY_ID, b.p))) return { ok: false, reason: 'unknown_part' }
  const physical = bricks.filter((b) => !isWheel(b) || isDriveWheel(b))
  const res = analyzeVehicle(physical)
  if (!res.ok) {
    // Only the sideways wheels are in the way: the kid just needs to turn them.
    const sideways = physical.length < bricks.length
    return sideways && analyzeVehicle(bricks).ok ? { ok: false, reason: 'wheels_sideways' } : res
  }
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
 * road cell, else the free dry cell nearest the city centre.
 */
export function spawnPoint(city: CityState, sizeOf: SizeOf): { x: number; z: number } {
  // Not under a model (vehicles may stand on roads), not in the water.
  const covered = new Set<string>(city.terrain?.water ?? [])
  for (const p of city.placements) {
    const { cw, cd } = placementCells(p, sizeOf(p.source))
    for (let x = p.cx; x < p.cx + cw; x++) for (let z = p.cz; z < p.cz + cd; z++) covered.add(roadKey(x, z))
  }
  const free = city.roads.filter((key) => !covered.has(key))
  const cells = (free.length > 0 ? free : city.roads).map((key) => key.split(',').map(Number) as [number, number])
  if (cells.length > 0) {
    const roads = new Set(free)
    const ahead = cells.find(([cx, cz]) => roads.has(roadKey(cx, cz - 1)))
    const [cx, cz] = ahead ?? cells[0]
    return cellCenter(cx, cz)
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

/**
 * Models lower than this (world units) are flat decorations the car drives over: one plate is 0.4
 * and its studs add 0.17, so a one-plate garden is 0.57 tall and a two-plate one 0.97.
 */
export const MIN_SOLID_HEIGHT = 0.6

/**
 * Whether a placed model is tall enough to block the car (`box` is its bounding box: model space,
 * or the placed world box, which is what counts for a scaled model).
 */
export const isSolidBox = (box: Box): boolean => box.max[1] >= MIN_SOLID_HEIGHT

/**
 * World AABB of a placed model, given its model-space bounding box. Matches `placementMatrix` (src/render/placementTransform.ts; a cross-test keeps them equal):
 * the model is turned `rot` quarter turns (counter-clockwise) around its baseplate centre, made `s`
 * times bigger around that centre (height from the ground) and centred on its footprint cells.
 */
export function placementWorldBox(
  p: Pick<CityPlacement, 'cx' | 'cz' | 'rot' | 's' | 'fit'>,
  baseplate: Baseplate,
  model: Box,
): Box {
  const { x: wx, z: wz } = placementCenter(p, baseplate)
  const k = drawScale(p)
  const cos = QUARTER_COS[p.rot]
  const sin = QUARTER_SIN[p.rot]
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const mx of [model.min[0], model.max[0]]) {
    for (const mz of [model.min[2], model.max[2]]) {
      const lx = (mx - baseplate.w / 2) * k
      const lz = (mz - baseplate.d / 2) * k
      const x = lx * cos + lz * sin + wx
      const z = -lx * sin + lz * cos + wz
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
  }
  return { min: [minX, model.min[1] * k, minZ], max: [maxX, model.max[1] * k, maxZ] }
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
 * positive angle. Turns are gentler at speed. `tuning`: the city's limits unless a mode has its own.
 */
export function steerAngle(steer: number, forwardSpeed: number, tuning: SteerTuning = DRIVE): number {
  const fast = Math.min(1, Math.abs(forwardSpeed) / DRIVE.MAX_SPEED)
  const scale = 1 - (1 - tuning.STEER_AT_SPEED) * fast
  return -steer * tuning.MAX_STEER * scale
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
