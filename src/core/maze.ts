import type { LocalizedText } from './types'
import { newId } from './ids'

export interface Cell {
  cx: number
  cz: number
}

export interface Maze {
  id: string
  name: string
  /** Cells along X (odd). */
  w: number
  /** Cells along Z (odd). */
  h: number
  /** "cx,cz" keys of wall cells. */
  walls: string[]
  entry: Cell | null
  exit: Cell | null
  /** "cx,cz" keys. */
  coins: string[]
  /** Colour id. */
  wallColor: number
  /** Baseplate colour id (default 24, light bluish gray). */
  floorColor?: number
  createdAt: number
  updatedAt: number
  templateId?: string
}

export interface MazeTemplate {
  id: string
  name: LocalizedText
  difficulty: 1 | 2 | 3
  maze: Omit<Maze, 'id' | 'createdAt' | 'updatedAt'>
}

/**
 * A maze cell is this many studs (world units) square: wider than a city cell (`CELL`, 8), so the
 * ready-made cars can turn in a one-cell corridor (tuned with a scripted driver: 12 still made the
 * trucks back up at most corners). Stored mazes count cells, never studs.
 */
export const MAZE_CELL = 13
/** Vehicles wider than this (wheels included, see `vehicleWidth`) do not fit a corridor: a stud of room each side. */
export const MAZE_MAX_VEHICLE_WIDTH = MAZE_CELL - 2

export const MAZE_MIN_SIZE = 7
export const MAZE_MAX_SIZE = 21
export const DEFAULT_MAZE_WALL_COLOR = 6 // orange
export const DEFAULT_MAZE_FLOOR_COLOR = 24 // light bluish gray

/**
 * Three stars when the run takes at most this many seconds per cell of the shortest path: an
 * average of 5 studs / s (2.6 s per 13-stud cell)...
 */
export const STAR3_SEC_PER_CELL = MAZE_CELL / 5
/** ...two stars up to 3 studs / s; slower runs still earn one star. */
export const STAR2_SEC_PER_CELL = MAZE_CELL / 3
/**
 * The same limits for cells crossed block by block (the top-down view's step mode): a step takes
 * about 0.22 s, so the driving limits above would hand out three stars for any wandering. One second
 * per cell of the shortest way still leaves room to stop, think and try a dead end or two.
 */
export const STEP_STAR3_SEC_PER_CELL = 1
export const STEP_STAR2_SEC_PER_CELL = 2

type Dims = Pick<Maze, 'w' | 'h'>

export function cellKey(cell: Cell): string {
  return `${cell.cx},${cell.cz}`
}

export function parseCellKey(key: string): Cell {
  const [cx, cz] = key.split(',').map(Number)
  return { cx, cz }
}

function sameCell(a: Cell | null, b: Cell | null): boolean {
  return a !== null && b !== null && a.cx === b.cx && a.cz === b.cz
}

export function inBounds(dims: Dims, cell: Cell): boolean {
  return cell.cx >= 0 && cell.cz >= 0 && cell.cx < dims.w && cell.cz < dims.h
}

/** On the outer ring of the grid (false for cells outside the grid). */
export function isBorder(dims: Dims, cell: Cell): boolean {
  return (
    inBounds(dims, cell) &&
    (cell.cx === 0 || cell.cz === 0 || cell.cx === dims.w - 1 || cell.cz === dims.h - 1)
  )
}

export function isCorner(dims: Dims, cell: Cell): boolean {
  return (
    (cell.cx === 0 || cell.cx === dims.w - 1) && (cell.cz === 0 || cell.cz === dims.h - 1)
  )
}

/** The up-to-4 orthogonal neighbours that lie inside the grid. */
export function neighbors4(dims: Dims, cell: Cell): Cell[] {
  const out: Cell[] = []
  const { cx, cz } = cell
  if (cx + 1 < dims.w) out.push({ cx: cx + 1, cz })
  if (cx > 0) out.push({ cx: cx - 1, cz })
  if (cz + 1 < dims.h) out.push({ cx, cz: cz + 1 })
  if (cz > 0) out.push({ cx, cz: cz - 1 })
  return out
}

export interface CreateMazeOptions {
  id?: string
  name?: string
  wallColor?: number
  floorColor?: number
  /** Timestamp for createdAt/updatedAt (default Date.now()). */
  now?: number
}

/** A maze whose outer ring is solid wall and whose interior is all open floor. */
export function createEmptyMaze(w: number, h: number, opts: CreateMazeOptions = {}): Maze {
  for (const n of [w, h]) {
    if (!Number.isInteger(n) || n % 2 === 0 || n < MAZE_MIN_SIZE || n > MAZE_MAX_SIZE) {
      throw new RangeError(`maze size must be odd and in ${MAZE_MIN_SIZE}..${MAZE_MAX_SIZE}, got ${n}`)
    }
  }
  const walls: string[] = []
  for (let cz = 0; cz < h; cz++) {
    for (let cx = 0; cx < w; cx++) {
      if (isBorder({ w, h }, { cx, cz })) walls.push(cellKey({ cx, cz }))
    }
  }
  const now = opts.now ?? Date.now()
  return {
    id: opts.id ?? newId('maze'),
    name: opts.name ?? '',
    w,
    h,
    walls,
    entry: null,
    exit: null,
    coins: [],
    wallColor: opts.wallColor ?? DEFAULT_MAZE_WALL_COLOR,
    floorColor: opts.floorColor ?? DEFAULT_MAZE_FLOOR_COLOR,
    createdAt: now,
    updatedAt: now,
  }
}

const sameDoor = (a: Cell | null, b: Cell | null): boolean => (a === null ? b === null : sameCell(a, b))
const sameKeys = (a: string[], b: string[]): boolean => {
  const set = new Set(a)
  return set.size === new Set(b).size && b.every((k) => set.has(k))
}

/**
 * Whether two mazes drive the same: same size, walls, doors and coins (cell lists compared as
 * sets). The name, colours, ids and timestamps do not count. A run's record only stands for the
 * layout it was driven on.
 */
export function sameLayout(a: Maze, b: Maze): boolean {
  return (
    a.w === b.w && a.h === b.h &&
    sameDoor(a.entry, b.entry) && sameDoor(a.exit, b.exit) &&
    sameKeys(a.walls, b.walls) && sameKeys(a.coins, b.coins)
  )
}

/**
 * Make `cell` a wall (`wall` true) or open floor (false). No-op (same maze) on the entry/exit cells,
 * outside the grid, and when removing a wall on the outer ring: the border only opens through
 * setEntry/setExit, so an eraser stroke along the edge can never punch a hole.
 * A coin on a cell that becomes wall is removed.
 */
export function toggleWall(maze: Maze, cell: Cell, wall: boolean): Maze {
  if (!inBounds(maze, cell) || sameCell(cell, maze.entry) || sameCell(cell, maze.exit)) return maze
  const key = cellKey(cell)
  if (!wall && isBorder(maze, cell)) return maze
  const isWall = maze.walls.includes(key)
  if (wall === isWall) return maze
  if (wall) {
    return { ...maze, walls: [...maze.walls, key], coins: maze.coins.filter((k) => k !== key) }
  }
  return { ...maze, walls: maze.walls.filter((k) => k !== key) }
}

/** Apply a drag stroke: set every cell of `cells` to wall / floor. */
export function paintWalls(maze: Maze, cells: Cell[], wall: boolean): Maze {
  return cells.reduce((m, cell) => toggleWall(m, cell, wall), maze)
}

/** Put or remove a coin on a floor cell (not on the entry/exit, walls, or outside the grid). */
export function toggleCoin(maze: Maze, cell: Cell): Maze {
  if (!inBounds(maze, cell) || sameCell(cell, maze.entry) || sameCell(cell, maze.exit)) return maze
  const key = cellKey(cell)
  if (maze.walls.includes(key)) return maze
  return maze.coins.includes(key)
    ? { ...maze, coins: maze.coins.filter((k) => k !== key) }
    : { ...maze, coins: [...maze.coins, key] }
}

/** A border wall is never an error: it is carved open (see setEntry). */
export type DoorError = 'not_border' | 'corner' | 'same_cell'
export type DoorResult = { maze: Maze } | { error: DoorError }

function setDoor(maze: Maze, cell: Cell, which: 'entry' | 'exit'): DoorResult {
  if (!isBorder(maze, cell)) return { error: 'not_border' }
  if (isCorner(maze, cell)) return { error: 'corner' }
  const other = which === 'entry' ? maze.exit : maze.entry
  if (sameCell(cell, other)) return { error: 'same_cell' }
  const previous = maze[which]
  if (sameCell(previous, cell)) return { maze }
  const key = cellKey(cell)
  let walls = maze.walls.filter((k) => k !== key) // tapping a border wall carves a door
  if (previous) {
    // Moving a door closes the old one so no stray gap is left in the outer ring.
    walls = [...walls, cellKey(previous)]
  }
  return {
    maze: { ...maze, [which]: { cx: cell.cx, cz: cell.cz }, walls, coins: maze.coins.filter((k) => k !== key) },
  }
}

/** Set the entry on a non-corner border cell. A border wall cell is carved open (a door); the previous entry is walled up again. */
export function setEntry(maze: Maze, cell: Cell): DoorResult {
  return setDoor(maze, cell, 'entry')
}

/** Set the exit on a non-corner border cell; same rules as {@link setEntry}. */
export function setExit(maze: Maze, cell: Cell): DoorResult {
  return setDoor(maze, cell, 'exit')
}

/** Remove the entry or exit: the door cell is walled up again. No-op (same maze) when it is not set. */
export function clearDoor(maze: Maze, which: 'entry' | 'exit'): Maze {
  const door = maze[which]
  if (!door) return maze
  return { ...maze, [which]: null, walls: [...maze.walls, cellKey(door)] }
}

/** Shortest 4-neighbour path over floor cells from `from` (default: the entry) to the exit, both ends included; null if none. */
export function solve(maze: Maze, from?: Cell): Cell[] | null {
  const start = from ?? maze.entry
  const goal = maze.exit
  if (!start || !goal || !inBounds(maze, start)) return null
  const walls = new Set(maze.walls)
  if (walls.has(cellKey(start))) return null
  const prev = new Map<string, Cell | null>([[cellKey(start), null]])
  const queue: Cell[] = [start]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    if (sameCell(cur, goal)) {
      const path: Cell[] = []
      for (let at: Cell | null | undefined = cur; at; at = prev.get(cellKey(at))) path.push(at)
      return path.reverse()
    }
    for (const n of neighbors4(maze, cur)) {
      const k = cellKey(n)
      if (prev.has(k) || walls.has(k)) continue
      prev.set(k, cur)
      queue.push(n)
    }
  }
  return null
}

export type PlayabilityError = 'no_entry' | 'no_exit' | 'no_path'

export function playabilityError(maze: Maze): PlayabilityError | null {
  if (!maze.entry) return 'no_entry'
  if (!maze.exit) return 'no_exit'
  return solve(maze) ? null : 'no_path'
}

export function isPlayable(maze: Maze): boolean {
  return playabilityError(maze) === null
}

/** The next `count` cells along the shortest path from the car's cell to the exit (excluding that cell); empty if at the exit or stuck. */
export function nextHintCells(maze: Maze, from: Cell, count = 4): Cell[] {
  const path = solve(maze, from)
  return path ? path.slice(1, 1 + count) : []
}

export interface StarThresholds {
  /** A run of at most this many seconds earns three stars. */
  threeSec: number
  /** ...at most this many, two stars. */
  twoSec: number
}

/**
 * Star time limits from the shortest path length L (in cells; 0 if the maze is unsolvable).
 * `stepShare` (0..1) is the share of the run's cells crossed in step mode: the limits per cell blend
 * from the driving ones (0, the default) to the step ones (1).
 */
export function starThresholds(maze: Maze, stepShare = 0): StarThresholds {
  const length = solve(maze)?.length ?? 0
  const k = Math.min(1, Math.max(0, stepShare))
  const per = (drive: number, step: number) => drive + (step - drive) * k
  return {
    threeSec: length * per(STAR3_SEC_PER_CELL, STEP_STAR3_SEC_PER_CELL),
    twoSec: length * per(STAR2_SEC_PER_CELL, STEP_STAR2_SEC_PER_CELL),
  }
}

export function rateRun(maze: Maze, timeMs: number, stepShare = 0): 1 | 2 | 3 {
  const { threeSec, twoSec } = starThresholds(maze, stepShare)
  if (timeMs <= threeSec * 1000) return threeSec > 0 ? 3 : 1
  if (timeMs <= twoSec * 1000) return 2
  return 1
}
