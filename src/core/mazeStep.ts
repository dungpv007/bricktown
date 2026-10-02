import { MAZE_CELL, cellKey, inBounds, solve, type Cell, type Maze } from './maze'
import { cellAtPoint, cellCenterXZ } from './mazeRun'

/**
 * Block-by-block moves for the maze's top-down view: the car hops from one floor cell's centre to
 * the next instead of being steered. Pure (no three.js, no physics): the scene feeds it presses,
 * held directions and time, and reads back a pose and events (a step started, a cell reached, a
 * bump into a wall). World units are studs; a heading (yaw) of 0 faces -Z and turns
 * counter-clockwise seen from above, like the vehicle's.
 */

export type StepDir = 'up' | 'down' | 'left' | 'right'

export const STEP_DIRS: readonly StepDir[] = ['up', 'down', 'left', 'right']

/**
 * Screen directions of the top-down camera as grid moves. That camera always looks north (towards
 * -Z) from the south, with +X to the right (see `MAZE_TILT` / `frameMaze`), so the top of the
 * screen is -Z and the right of the screen is +X, wherever the car faces.
 */
export const TOP_VIEW_DELTA: Readonly<Record<StepDir, { dx: number; dz: number }>> = {
  up: { dx: 0, dz: -1 },
  down: { dx: 0, dz: 1 },
  left: { dx: -1, dz: 0 },
  right: { dx: 1, dz: 0 },
}

/** The heading that faces `dir` on the top-down screen. */
export function stepYaw(dir: StepDir): number {
  const { dx, dz } = TOP_VIEW_DELTA[dir]
  return Math.atan2(-dx, -dz)
}

/** The grid direction closest to heading `yaw`. */
export function nearestDir(yaw: number): StepDir {
  const quarter = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4
  return (['up', 'left', 'down', 'right'] as const)[quarter]
}

/** The direction from a cell to its neighbour `to` (null when they are not neighbours). */
export function dirBetween(from: Cell, to: Cell): StepDir | null {
  const dx = to.cx - from.cx
  const dz = to.cz - from.cz
  return STEP_DIRS.find((d) => TOP_VIEW_DELTA[d].dx === dx && TOP_VIEW_DELTA[d].dz === dz) ?? null
}

/** Inside the grid and not a wall: the car may stand there. */
export function isFloor(maze: Pick<Maze, 'w' | 'h' | 'walls'>, cell: Cell): boolean {
  return inBounds(maze, cell) && !maze.walls.includes(cellKey(cell))
}

export type StepTarget = { cell: Cell } | { blocked: 'wall' | 'bounds' }

/** Where one step `dir` from `from` leads: the next cell, or what is in the way. */
export function stepTarget(maze: Pick<Maze, 'w' | 'h' | 'walls'>, from: Cell, dir: StepDir): StepTarget {
  const { dx, dz } = TOP_VIEW_DELTA[dir]
  const cell = { cx: from.cx + dx, cz: from.cz + dz }
  if (!inBounds(maze, cell)) return { blocked: 'bounds' }
  if (maze.walls.includes(cellKey(cell))) return { blocked: 'wall' }
  return { cell }
}

/** How much nearer (studs) a cell off the way out must be than one on it to be picked by `snapCell`. */
const PATH_PREFERENCE = MAZE_CELL / 4

/**
 * The floor cell the car is set down in when the step mode starts: the cell under (x, z) if it is
 * floor, else the nearest floor cell, cells on the way from the entry to the exit winning unless
 * another one is clearly nearer. Null only for a maze without floor.
 */
export function snapCell(maze: Maze, x: number, z: number): Cell | null {
  const here = cellAtPoint(x, z)
  if (isFloor(maze, here)) return here
  const onPath = new Set((solve(maze) ?? []).map(cellKey))
  const walls = new Set(maze.walls)
  let best: Cell | null = null
  let bestScore = Infinity
  for (let cz = 0; cz < maze.h; cz++) {
    for (let cx = 0; cx < maze.w; cx++) {
      const key = cellKey({ cx, cz })
      if (walls.has(key)) continue
      const c = cellCenterXZ({ cx, cz })
      const score = Math.hypot(c.x - x, c.z - z) - (onPath.has(key) ? PATH_PREFERENCE : 0)
      if (score < bestScore) {
        bestScore = score
        best = { cx, cz }
      }
    }
  }
  return best
}

/** One step's glide from cell centre to cell centre (seconds). */
export const STEP_SECONDS = 0.22
/** The bump against a wall: there and back (seconds)... */
export const BUMP_SECONDS = 0.18
/** ...this far towards the wall (studs). */
export const BUMP_DISTANCE = 1.6
/** Gliding to the cell centre when the step mode starts (seconds, at most). */
export const SNAP_SECONDS = 0.25
/** The car has turned to face its way after this share of a step. */
const TURN_SHARE = 0.45

export interface StepMotion {
  kind: 'move' | 'bump' | 'snap'
  fromX: number
  fromZ: number
  toX: number
  toZ: number
  fromYaw: number
  toYaw: number
  /** Seconds into the motion. */
  t: number
  duration: number
  /** Where the car is once the motion ends (a bump ends where it started). */
  to: Cell
}

export interface Stepper {
  /** The cell the car stands in (while moving: the one it left). */
  cell: Cell
  /** Heading once the current motion ends (continuous: not wrapped, so turns take the short way). */
  yaw: number
  motion: StepMotion | null
  /** A press that came during a motion: the next step (one at most, the latest wins). */
  queued: StepDir | null
}

export type StepEvent = { type: 'start'; dir: StepDir; to: Cell } | { type: 'arrive'; cell: Cell } | { type: 'bump'; dir: StepDir }

export interface StepResult {
  stepper: Stepper
  events: StepEvent[]
}

/** `target` shifted by whole turns to be within half a turn of `from` (so the car turns the short way). */
function nearYaw(from: number, target: number): number {
  const TWO_PI = Math.PI * 2
  return target + Math.round((from - target) / TWO_PI) * TWO_PI
}

/** The car standing still at `cell`'s centre facing `yaw` (e.g. a test teleport). */
export function placeStepper(cell: Cell, yaw: number): Stepper {
  return { cell, yaw, motion: null, queued: null }
}

/**
 * The step mode starts with the car at (x, z) facing `yaw`: it glides to the centre of its cell
 * (see `snapCell`), turning to the nearest grid direction. The cell counts as reached at once.
 */
export function startStepper(maze: Maze, x: number, z: number, yaw: number): StepResult | null {
  const cell = snapCell(maze, x, z)
  if (!cell) return null
  const toYaw = nearYaw(yaw, stepYaw(nearestDir(yaw)))
  const c = cellCenterXZ(cell)
  const dist = Math.hypot(c.x - x, c.z - z)
  const turning = Math.abs(toYaw - yaw) > 1e-3
  const motion: StepMotion | null =
    dist > 0.05 || turning
      ? { kind: 'snap', fromX: x, fromZ: z, toX: c.x, toZ: c.z, fromYaw: yaw, toYaw, t: 0, duration: SNAP_SECONDS * Math.min(1, Math.max(0.4, dist / MAZE_CELL)), to: cell }
      : null
  return { stepper: { cell, yaw: toYaw, motion, queued: null }, events: [{ type: 'arrive', cell }] }
}

/**
 * A step `dir` from a car standing still: a move to the next cell, or a bump when it is blocked.
 * A held direction repeating (`repeat`) never bumps: holding a key against a wall stays quiet.
 */
function begin(s: Stepper, maze: Maze, dir: StepDir, repeat: boolean): StepResult | null {
  const target = stepTarget(maze, s.cell, dir)
  const toYaw = nearYaw(s.yaw, stepYaw(dir))
  const from = cellCenterXZ(s.cell)
  if ('blocked' in target) {
    if (repeat) return null
    const { dx, dz } = TOP_VIEW_DELTA[dir]
    const motion: StepMotion = {
      kind: 'bump', fromX: from.x, fromZ: from.z, toX: from.x + dx * BUMP_DISTANCE, toZ: from.z + dz * BUMP_DISTANCE,
      fromYaw: s.yaw, toYaw, t: 0, duration: BUMP_SECONDS, to: s.cell,
    }
    return { stepper: { ...s, yaw: toYaw, motion }, events: [{ type: 'bump', dir }] }
  }
  const to = cellCenterXZ(target.cell)
  const motion: StepMotion = {
    kind: 'move', fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, fromYaw: s.yaw, toYaw, t: 0, duration: STEP_SECONDS, to: target.cell,
  }
  return { stepper: { ...s, yaw: toYaw, motion }, events: [{ type: 'start', dir, to: target.cell }] }
}

/** A press of `dir`: steps now when the car stands still, else queues the step (replacing a queued one). */
export function pressStep(s: Stepper, maze: Maze, dir: StepDir): StepResult {
  if (s.motion) return { stepper: { ...s, queued: dir }, events: [] }
  return begin(s, maze, dir, false) ?? { stepper: s, events: [] }
}

/**
 * Runs the motion on by `dt` seconds. When it ends, the queued step follows, else the held
 * direction `held` repeats (left-over time carries into the next step, so holding glides on evenly).
 */
export function advanceStepper(s: Stepper, maze: Maze, dt: number, held: StepDir | null): StepResult {
  const events: StepEvent[] = []
  let st = s
  let left = dt
  for (let guard = 0; guard < 8; guard++) {
    const m = st.motion
    if (m) {
      const remaining = m.duration - m.t
      if (left < remaining) {
        st = { ...st, motion: { ...m, t: m.t + left } }
        break
      }
      left -= remaining
      st = { ...st, cell: m.to, motion: null }
      if (m.kind === 'move') events.push({ type: 'arrive', cell: m.to })
    }
    const next = st.queued ?? held
    const repeat = st.queued === null
    st = { ...st, queued: null }
    if (!next) break
    const r = begin(st, maze, next, repeat)
    if (!r) break
    st = r.stepper
    events.push(...r.events)
  }
  return { stepper: st, events }
}

/** Position share of a move after `u` (0..1) of its time: eased in and out, but never to a full stop mid-run. */
const glide = (u: number) => 0.5 * u + 0.25 * (1 - Math.cos(Math.PI * u))
const glideRate = (u: number) => 0.5 + 0.25 * Math.PI * Math.sin(Math.PI * u)
const easeOut = (u: number) => 1 - (1 - u) * (1 - u)

export interface StepPose {
  x: number
  z: number
  yaw: number
  /** Forward speed (studs / s; negative backing off a wall): spins the wheels. */
  speed: number
}

/** Where the car is drawn now. */
export function stepperPose(s: Stepper): StepPose {
  const m = s.motion
  if (!m) {
    const c = cellCenterXZ(s.cell)
    return { x: c.x, z: c.z, yaw: s.yaw, speed: 0 }
  }
  const u = Math.min(1, m.t / m.duration)
  const yaw = m.fromYaw + (m.toYaw - m.fromYaw) * easeOut(Math.min(1, u / TURN_SHARE))
  const dist = Math.hypot(m.toX - m.fromX, m.toZ - m.fromZ)
  if (m.kind === 'bump') {
    const k = Math.sin(Math.PI * u)
    const speed = (dist * Math.PI * Math.cos(Math.PI * u)) / m.duration
    return { x: m.fromX + (m.toX - m.fromX) * k, z: m.fromZ + (m.toZ - m.fromZ) * k, yaw, speed }
  }
  const k = glide(u)
  return { x: m.fromX + (m.toX - m.fromX) * k, z: m.fromZ + (m.toZ - m.fromZ) * k, yaw, speed: (dist * glideRate(u)) / m.duration }
}
