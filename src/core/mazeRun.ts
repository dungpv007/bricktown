import type { SteerTuning } from './drive'
import { MAZE_CELL, cellKey, inBounds, rateRun, type Cell, type Maze } from './maze'
import type { MazeRecord } from './types'

/**
 * Pure helpers for driving out of a maze: where the car starts, the wall colliders, the low
 * "void" around a maze, the run clock, stars, records and hints. World units (studs); a heading
 * (yaw) of 0 faces -Z and turns counter-clockwise seen from above, like the vehicle's.
 */

type Dims = Pick<Maze, 'w' | 'h'>

/** World centre of a cell on the floor. */
export const cellCenterXZ = (cell: Cell): { x: number; z: number } => ({ x: (cell.cx + 0.5) * MAZE_CELL, z: (cell.cz + 0.5) * MAZE_CELL })

/** The cell under a world point (may be outside the grid). */
export const cellAtPoint = (x: number, z: number): Cell => ({ cx: Math.floor(x / MAZE_CELL), cz: Math.floor(z / MAZE_CELL) })

/**
 * Steering in a maze: the wheels turn further than in the city when slow (a corridor corner needs a
 * tight turn), and keep less of that at speed so a fast car does not spin.
 */
export const MAZE_STEER: SteerTuning = { MAX_STEER: 0.8, STEER_AT_SPEED: 0.4 }

/** Heading that drives from `from` towards its neighbour `to`. */
function headingTowards(from: Cell, to: Cell): number {
  return Math.atan2(-(to.cx - from.cx), -(to.cz - from.cz))
}

/** The heading facing away from the border a door cell is on (into the maze). */
function inwardYaw(dims: Dims, cell: Cell): number {
  if (cell.cx === 0) return headingTowards(cell, { cx: 1, cz: cell.cz })
  if (cell.cx === dims.w - 1) return headingTowards(cell, { cx: cell.cx - 1, cz: cell.cz })
  if (cell.cz === 0) return headingTowards(cell, { cx: cell.cx, cz: 1 })
  return headingTowards(cell, { cx: cell.cx, cz: cell.cz - 1 })
}

/** Where the car starts: the entry cell's centre, facing into the maze. Null without an entry. */
export function spawnPose(maze: Maze): { x: number; z: number; yaw: number } | null {
  if (!maze.entry) return null
  return { ...cellCenterXZ(maze.entry), yaw: inwardYaw(maze, maze.entry) }
}

/** A block of cells: `w` along X and `d` along Z from (cx, cz). */
export interface CellRect {
  cx: number
  cz: number
  w: number
  d: number
}

/**
 * The wall cells as few boxes: the horizontal runs of each row, and a run continues downwards
 * while the next row has a run with exactly the same span. Covers every in-grid wall cell once.
 */
export function mergeWallRects(maze: Pick<Maze, 'w' | 'h' | 'walls'>): CellRect[] {
  const walls = new Set(maze.walls)
  const done: CellRect[] = []
  /** Boxes still growing downwards, by their "x0,x1" span. */
  let open = new Map<string, CellRect>()
  for (let cz = 0; cz < maze.h; cz++) {
    const next = new Map<string, CellRect>()
    for (let cx = 0; cx < maze.w; cx++) {
      if (!walls.has(cellKey({ cx, cz }))) continue
      const x0 = cx
      while (cx + 1 < maze.w && walls.has(cellKey({ cx: cx + 1, cz }))) cx++
      const span = `${x0},${cx}`
      const above = open.get(span)
      if (above) {
        above.d++
        open.delete(span)
        next.set(span, above)
      } else {
        next.set(span, { cx: x0, cz, w: cx - x0 + 1, d: 1 })
      }
    }
    done.push(...open.values())
    open = next
  }
  done.push(...open.values())
  return done.sort((a, b) => a.cz - b.cz || a.cx - b.cx)
}

/**
 * Wall cells with no floor cell among their 8 neighbours: the filler around a maze's shape (the
 * outside of the heart). They are drawn as low hedges so the maze's outline reads, but still
 * block the car. Diagonal floor counts, so a plain ring keeps its corners.
 */
export function voidWalls(maze: Pick<Maze, 'w' | 'h' | 'walls'>): Set<string> {
  const walls = new Set(maze.walls)
  const out = new Set<string>()
  for (const key of walls) {
    const [cx, cz] = key.split(',').map(Number)
    let touchesFloor = false
    for (let dx = -1; dx <= 1 && !touchesFloor; dx++) {
      for (let dz = -1; dz <= 1 && !touchesFloor; dz++) {
        const n = { cx: cx + dx, cz: cz + dz }
        if ((dx !== 0 || dz !== 0) && inBounds(maze, n) && !walls.has(cellKey(n))) touchesFloor = true
      }
    }
    if (!touchesFloor) out.add(key)
  }
  return out
}

/** A stopwatch that can pause (app hidden): `since` is when it last started, null while stopped. */
export interface RunClock {
  since: number | null
  /** Milliseconds counted before `since`. */
  banked: number
}

export const NEW_CLOCK: RunClock = { since: null, banked: 0 }

export function startClock(clock: RunClock, now: number): RunClock {
  return clock.since !== null ? clock : { since: now, banked: clock.banked }
}

export function pauseClock(clock: RunClock, now: number): RunClock {
  return clock.since === null ? clock : { since: null, banked: clockElapsed(clock, now) }
}

export function clockElapsed(clock: RunClock, now: number): number {
  return clock.banked + (clock.since === null ? 0 : Math.max(0, now - clock.since))
}

/** Stars for a run: by time (see `rateRun`), at most two once a hint was used. */
export function rateMazeRun(maze: Maze, timeMs: number, hintsUsed: number): 1 | 2 | 3 {
  const stars = rateRun(maze, timeMs)
  return hintsUsed > 0 && stars === 3 ? 2 : stars
}

/**
 * Whether `next` should replace the stored best run: more stars, else a faster time, else more
 * coins. Stars come first so a faster run that used a hint (two stars at most) never replaces a
 * three-star record.
 */
export function isBetterRecord(prev: MazeRecord | undefined, next: MazeRecord): boolean {
  if (!prev) return true
  if (next.stars !== prev.stars) return next.stars > prev.stars
  if (next.timeMs !== prev.timeMs) return next.timeMs < prev.timeMs
  return next.coins > prev.coins
}

/** How long the hint arrows stay on the floor... */
export const HINT_SHOW_MS = 4000
/** ...and how long from one hint until the next can be asked for. */
export const HINT_COOLDOWN_MS = 9000
/** How many cells ahead the arrows show. */
export const HINT_CELLS = 5

export const hintReady = (lastHintAt: number | null, now: number): boolean =>
  lastHintAt === null || now - lastHintAt >= HINT_COOLDOWN_MS

export const hintShowing = (lastHintAt: number | null, now: number): boolean =>
  lastHintAt !== null && now - lastHintAt >= 0 && now - lastHintAt < HINT_SHOW_MS

export interface HintArrow {
  cell: Cell
  /** The way to drive through this cell (same heading convention as the car). */
  yaw: number
}

/** One arrow per cell of `cells` (the way on from the car's cell `from`), pointing from the cell before. */
export function hintArrows(from: Cell, cells: Cell[]): HintArrow[] {
  return cells.map((cell, i) => ({ cell, yaw: headingTowards(i === 0 ? from : cells[i - 1], cell) }))
}
