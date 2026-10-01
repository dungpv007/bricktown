import { describe, expect, it } from 'vitest'
import { generateMaze, mulberry32, MAZE_GEN_COINS, MAZE_GEN_LOOPS } from './mazeGen'
import { cellKey, isBorder, isCorner, isPlayable, neighbors4, parseCellKey, solve, type Maze } from './maze'

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1)
const DIFFICULTIES = [1, 2, 3] as const

function pathCells(m: Maze): string[] {
  const walls = new Set(m.walls)
  const out: string[] = []
  for (let cz = 0; cz < m.h; cz++) {
    for (let cx = 0; cx < m.w; cx++) if (!walls.has(cellKey({ cx, cz }))) out.push(cellKey({ cx, cz }))
  }
  return out
}

function edgeCount(m: Maze): number {
  const walls = new Set(m.walls)
  let edges = 0
  for (const k of pathCells(m)) {
    for (const n of neighbors4(m, parseCellKey(k))) if (!walls.has(cellKey(n))) edges++
  }
  return edges / 2
}

/** Floor cells within 2 steps (path distance) of the entry. */
function nearEntry(m: Maze): Set<string> {
  const walls = new Set(m.walls)
  const dist = new Map([[cellKey(m.entry!), 0]])
  const queue = [m.entry!]
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbors4(m, queue[i])) {
      const k = cellKey(n)
      if (!walls.has(k) && !dist.has(k)) {
        dist.set(k, dist.get(cellKey(queue[i]))! + 1)
        queue.push(n)
      }
    }
  }
  return new Set([...dist].filter(([, d]) => d <= 2).map(([k]) => k))
}

/** The comparable part of a maze (id and timestamps are not deterministic). */
function shape(m: Maze) {
  return { w: m.w, h: m.h, walls: m.walls, entry: m.entry, exit: m.exit, coins: m.coins }
}

describe('mulberry32', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    for (let i = 0; i < 100; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('generateMaze', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    for (const d of DIFFICULTIES) {
      expect(shape(generateMaze(d, 42))).toEqual(shape(generateMaze(d, 42)))
      expect(shape(generateMaze(d, 42))).not.toEqual(shape(generateMaze(d, 43)))
    }
  })

  it('uses the default sizes per difficulty and honours overrides', () => {
    expect(generateMaze(1, 1)).toMatchObject({ w: 7, h: 7 })
    expect(generateMaze(2, 1)).toMatchObject({ w: 11, h: 11 })
    expect(generateMaze(3, 1)).toMatchObject({ w: 15, h: 15 })
    expect(generateMaze(1, 1, { w: 9, h: 13 })).toMatchObject({ w: 9, h: 13 })
  })

  it('applies metadata options', () => {
    const m = generateMaze(1, 1, { id: 'g', name: 'Gen', wallColor: 3, floorColor: 5, now: 7 })
    expect(m).toMatchObject({ id: 'g', name: 'Gen', wallColor: 3, floorColor: 5, createdAt: 7, updatedAt: 7 })
  })

  it('always yields a playable maze with a closed outer ring, a west entry and an east exit', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const m = generateMaze(d, seed)
        expect(isPlayable(m)).toBe(true)
        expect(m.entry!.cx).toBe(0)
        expect(m.exit!.cx).toBe(m.w - 1)
        for (const door of [m.entry!, m.exit!]) {
          expect(isBorder(m, door)).toBe(true)
          expect(isCorner(m, door)).toBe(false)
        }
        const walls = new Set(m.walls)
        const doors = new Set([cellKey(m.entry!), cellKey(m.exit!)])
        for (let cz = 0; cz < m.h; cz++) {
          for (let cx = 0; cx < m.w; cx++) {
            const k = cellKey({ cx, cz })
            if (isBorder(m, { cx, cz }) && !doors.has(k)) expect(walls.has(k)).toBe(true)
          }
        }
      }
    }
  })

  it('varies the door rows between seeds', () => {
    const rows = new Set(SEEDS.map((s) => generateMaze(2, s).entry!.cz))
    expect(rows.size).toBeGreaterThan(1)
  })

  it('Easy is a perfect maze (a spanning tree: no loops, nothing unreachable)', () => {
    for (const seed of SEEDS) {
      const m = generateMaze(1, seed)
      const cells = pathCells(m)
      expect(edgeCount(m)).toBe(cells.length - 1)
    }
  })

  it('Medium and Hard add loops', () => {
    for (const d of [2, 3] as const) {
      for (const seed of SEEDS) {
        const m = generateMaze(d, seed)
        const cells = pathCells(m)
        expect(edgeCount(m)).toBe(cells.length - 1 + MAZE_GEN_LOOPS[d])
      }
    }
  })

  it('has no unreachable floor pockets', () => {
    for (const d of DIFFICULTIES) {
      const m = generateMaze(d, 99)
      const reach = new Set<string>()
      const queue = [m.entry!]
      const walls = new Set(m.walls)
      reach.add(cellKey(m.entry!))
      for (let i = 0; i < queue.length; i++) {
        for (const n of neighbors4(m, queue[i])) {
          const k = cellKey(n)
          if (!walls.has(k) && !reach.has(k)) {
            reach.add(k)
            queue.push(n)
          }
        }
      }
      expect(reach.size).toBe(pathCells(m).length)
    }
  })

  it('places the configured number of coins on distinct path cells, never on the doors', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const m = generateMaze(d, seed)
        expect(m.coins).toHaveLength(MAZE_GEN_COINS[d])
        expect(new Set(m.coins).size).toBe(m.coins.length)
        const walls = new Set(m.walls)
        for (const k of m.coins) {
          expect(walls.has(k)).toBe(false)
          expect(k).not.toBe(cellKey(m.entry!))
          expect(k).not.toBe(cellKey(m.exit!))
        }
      }
    }
  })

  it('keeps coins more than 2 cells (path distance) away from the entry spawn', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const m = generateMaze(d, seed)
        const near = nearEntry(m)
        for (const k of m.coins) expect(near.has(k)).toBe(false)
      }
    }
  })

  it('puts coins on dead ends first, spilling onto other floor cells only when there are too few', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const m = generateMaze(d, seed)
        const walls = new Set(m.walls)
        const isDeadEnd = (k: string) =>
          neighbors4(m, parseCellKey(k)).filter((n) => !walls.has(cellKey(n))).length === 1
        const near = nearEntry(m)
        const deadEnds = pathCells(m).filter(
          (k) => isDeadEnd(k) && k !== cellKey(m.entry!) && k !== cellKey(m.exit!) && !near.has(k),
        )
        const onDeadEnds = m.coins.filter((k) => deadEnds.includes(k)).length
        expect(onDeadEnds).toBe(Math.min(m.coins.length, deadEnds.length))
      }
    }
  })

  it('the solution is a real detour, not a straight line', () => {
    for (const d of DIFFICULTIES) {
      const m = generateMaze(d, 11)
      const path = solve(m)!
      expect(path.length).toBeGreaterThan(m.w + 2)
    }
  })
})
