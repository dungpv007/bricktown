import { cellKey, createEmptyMaze, neighbors4, parseCellKey, type CreateMazeOptions, type Maze } from './maze'

export type MazeDifficulty = 1 | 2 | 3

/** Default grid size (cells per side) per difficulty. */
export const MAZE_GEN_SIZE: Record<MazeDifficulty, number> = { 1: 7, 2: 11, 3: 15 }
/** Extra walls knocked out of the perfect maze to create loops (shortcuts and alternative routes). */
export const MAZE_GEN_LOOPS: Record<MazeDifficulty, number> = { 1: 0, 2: 3, 3: 6 }
/** Coins placed per difficulty. */
export const MAZE_GEN_COINS: Record<MazeDifficulty, number> = { 1: 3, 2: 5, 3: 8 }

export interface GenerateMazeOptions extends CreateMazeOptions {
  /** Override the default width / height (odd, 7..21). */
  w?: number
  h?: number
}

/** Small seedable PRNG: returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], rnd: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * A random maze: a perfect maze carved with an iterative recursive backtracker on the odd grid
 * (rooms at odd coordinates, walls between them), with the entry on the west border and the exit
 * on the east border at random rows. Medium and Hard also get a few loops, and coins sit on
 * dead ends. Deterministic for a given (difficulty, seed, size).
 */
export function generateMaze(difficulty: MazeDifficulty, seed: number, opts: GenerateMazeOptions = {}): Maze {
  const size = MAZE_GEN_SIZE[difficulty]
  const base = createEmptyMaze(opts.w ?? size, opts.h ?? size, opts)
  const { w, h } = base
  const rnd = mulberry32(seed)
  const roomsX = (w - 1) / 2
  const roomsZ = (h - 1) / 2
  const room = (rx: number, rz: number) => ({ cx: 2 * rx + 1, cz: 2 * rz + 1 })

  // Recursive backtracker over the rooms, iteratively.
  const open = new Set<string>()
  const visited = new Set<string>()
  const start = { rx: Math.floor(rnd() * roomsX), rz: Math.floor(rnd() * roomsZ) }
  const stack = [start]
  visited.add(`${start.rx},${start.rz}`)
  open.add(cellKey(room(start.rx, start.rz)))
  while (stack.length > 0) {
    const cur = stack[stack.length - 1]
    const next = shuffled(
      [
        { rx: cur.rx + 1, rz: cur.rz },
        { rx: cur.rx - 1, rz: cur.rz },
        { rx: cur.rx, rz: cur.rz + 1 },
        { rx: cur.rx, rz: cur.rz - 1 },
      ].filter((n) => n.rx >= 0 && n.rz >= 0 && n.rx < roomsX && n.rz < roomsZ && !visited.has(`${n.rx},${n.rz}`)),
      rnd,
    )[0]
    if (!next) {
      stack.pop()
      continue
    }
    const a = room(cur.rx, cur.rz)
    const b = room(next.rx, next.rz)
    open.add(cellKey({ cx: (a.cx + b.cx) / 2, cz: (a.cz + b.cz) / 2 }))
    open.add(cellKey(b))
    visited.add(`${next.rx},${next.rz}`)
    stack.push(next)
  }

  // Loops: knock out interior walls that sit between two rooms.
  const loopCandidates: string[] = []
  for (let cz = 1; cz < h - 1; cz++) {
    for (let cx = 1; cx < w - 1; cx++) {
      const between = (cx % 2 === 0) !== (cz % 2 === 0) // exactly one coordinate even
      const k = cellKey({ cx, cz })
      if (between && !open.has(k)) loopCandidates.push(k)
    }
  }
  for (const k of shuffled(loopCandidates, rnd).slice(0, MAZE_GEN_LOOPS[difficulty])) open.add(k)

  // Doors: west and east border at random room rows.
  const entry = { cx: 0, cz: 2 * Math.floor(rnd() * roomsZ) + 1 }
  const exit = { cx: w - 1, cz: 2 * Math.floor(rnd() * roomsZ) + 1 }
  open.add(cellKey(entry))
  open.add(cellKey(exit))

  const walls: string[] = []
  for (let cz = 0; cz < h; cz++) {
    for (let cx = 0; cx < w; cx++) {
      const k = cellKey({ cx, cz })
      if (!open.has(k)) walls.push(k)
    }
  }

  // Coins: dead ends first (shuffled), then any other floor cell if there are too few.
  const doors = new Set([cellKey(entry), cellKey(exit)])
  const floor = [...open].filter((k) => !doors.has(k))
  const isDeadEnd = (k: string) => neighbors4(base, parseCellKey(k)).filter((n) => open.has(cellKey(n))).length === 1
  const deadEnds = shuffled(floor.filter(isDeadEnd), rnd)
  const others = shuffled(floor.filter((k) => !isDeadEnd(k)), rnd)
  const coins = [...deadEnds, ...others].slice(0, MAZE_GEN_COINS[difficulty])

  return { ...base, walls, entry, exit, coins }
}
