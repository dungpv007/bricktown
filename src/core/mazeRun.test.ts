import { describe, expect, it } from 'vitest'
import { getMazeTemplate } from '../content/mazes'
import { uprightYaw } from './drive'
import {
  MAZE_CELL,
  STAR3_SEC_PER_CELL,
  STEP_STAR2_SEC_PER_CELL,
  STEP_STAR3_SEC_PER_CELL,
  cellKey,
  createEmptyMaze,
  rateRun,
  setEntry,
  setExit,
  solve,
  starThresholds,
  type Cell,
  type Maze,
} from './maze'
import { STEP_SECONDS } from './mazeStep'
import {
  HINT_COOLDOWN_MS,
  HINT_SHOW_MS,
  MAZE_STEER,
  NEW_CLOCK,
  cellAtPoint,
  cellCenterXZ,
  clockElapsed,
  hintArrows,
  hintReady,
  hintShowing,
  isBetterRecord,
  mergeWallRects,
  pauseClock,
  rateMazeRun,
  spawnPose,
  startClock,
  voidWalls,
  type CellRect,
} from './mazeRun'

const c = (cx: number, cz: number): Cell => ({ cx, cz })

function withDoors(maze: Maze, entry: Cell, exit: Cell): Maze {
  const a = setEntry(maze, entry)
  if ('error' in a) throw new Error(a.error)
  const b = setExit(a.maze, exit)
  if ('error' in b) throw new Error(b.error)
  return b.maze
}

/** Forward (x, z) of a yaw (0 = facing -Z, counter-clockwise from above), as the vehicle uses it. */
const forwardOf = (yaw: number): [number, number] => [-Math.sin(yaw), -Math.cos(yaw)]

describe('maze cells in the world', () => {
  it('are 13 studs: wider than a city cell, so a car can turn in a corridor', () => {
    expect(MAZE_CELL).toBe(13)
    expect(cellCenterXZ(c(2, 3))).toEqual({ x: 32.5, z: 45.5 })
  })
  it('cellAtPoint finds the cell under a point (the inverse of cellCenterXZ)', () => {
    expect(cellAtPoint(32.5, 45.5)).toEqual(c(2, 3))
    expect(cellAtPoint(25.9, 40)).toEqual(c(1, 3))
    expect(cellAtPoint(0, 0)).toEqual(c(0, 0))
  })
  it('steers tighter than the city at low speed, gentler at speed', () => {
    expect(MAZE_STEER.MAX_STEER).toBeCloseTo(0.8)
    expect(MAZE_STEER.MAX_STEER * MAZE_STEER.STEER_AT_SPEED).toBeLessThan(0.4)
  })
})

describe('spawnPose', () => {
  const empty = createEmptyMaze(7, 7, { id: 'm', now: 0 })
  it.each([
    ['west', c(0, 3), [1, 0]],
    ['east', c(6, 3), [-1, 0]],
    ['north', c(3, 0), [0, 1]],
    ['south', c(3, 6), [0, -1]],
  ] as const)('an entry on the %s border faces into the maze', (_side, entry, inward) => {
    const exit = entry.cx === 3 ? c(0, 3) : c(3, 0)
    const pose = spawnPose(withDoors(empty, entry, exit))!
    expect(pose.x).toBe((entry.cx + 0.5) * MAZE_CELL)
    expect(pose.z).toBe((entry.cz + 0.5) * MAZE_CELL)
    const [fx, fz] = forwardOf(pose.yaw)
    expect(fx).toBeCloseTo(inward[0])
    expect(fz).toBeCloseTo(inward[1])
    // Same convention as the vehicle's own heading helper.
    expect(uprightYaw([fx, 0, fz])).toBeCloseTo(pose.yaw)
  })

  it('is null without an entry', () => {
    expect(spawnPose(empty)).toBeNull()
  })
})

/** Every cell covered by the rects, failing on overlaps. */
function covered(rects: CellRect[]): string[] {
  const out = new Set<string>()
  for (const r of rects) {
    for (let x = r.cx; x < r.cx + r.w; x++) {
      for (let z = r.cz; z < r.cz + r.d; z++) {
        const k = cellKey(c(x, z))
        if (out.has(k)) throw new Error(`overlap at ${k}`)
        out.add(k)
      }
    }
  }
  return [...out].sort()
}

describe('mergeWallRects', () => {
  it('covers an empty maze ring with four boxes', () => {
    const maze = createEmptyMaze(7, 7, { id: 'm', now: 0 })
    const rects = mergeWallRects(maze)
    expect(rects).toHaveLength(4)
    expect(covered(rects)).toEqual([...maze.walls].sort())
  })

  it('merges equal runs of consecutive rows into one box', () => {
    const maze = { w: 7, h: 7, walls: ['1,1', '2,1', '3,1', '1,2', '2,2', '3,2', '5,4'] }
    expect(mergeWallRects(maze)).toEqual([
      { cx: 1, cz: 1, w: 3, d: 2 },
      { cx: 5, cz: 4, w: 1, d: 1 },
    ])
  })

  it.each(['easy', 'medium', 'hard', 'spiral', 'heart'])('covers exactly the walls of the %s template, with far fewer boxes', (id) => {
    const maze = getMazeTemplate(id)!.maze
    const rects = mergeWallRects(maze)
    expect(covered(rects)).toEqual([...new Set(maze.walls)].sort())
    expect(rects.length).toBeLessThan(maze.walls.length / 2)
  })

  it('ignores duplicate and off-grid keys', () => {
    expect(mergeWallRects({ w: 7, h: 7, walls: ['1,1', '1,1', '9,9', '-1,0'] })).toEqual([{ cx: 1, cz: 1, w: 1, d: 1 }])
  })
})

describe('voidWalls', () => {
  it('a wall touching floor, even only diagonally, is a real wall', () => {
    const maze = createEmptyMaze(7, 7, { id: 'm', now: 0 })
    // Every ring cell touches the open inside (the corners diagonally).
    expect(voidWalls(maze).size).toBe(0)
  })

  it('walls with no floor around them are void', () => {
    const maze = createEmptyMaze(7, 7, { id: 'm', now: 0 })
    const inside: string[] = []
    for (let x = 1; x <= 5; x++) for (let z = 1; z <= 3; z++) inside.push(cellKey(c(x, z)))
    const filled = { ...maze, walls: [...maze.walls, ...inside] }
    const v = voidWalls(filled)
    // Rows 0..2 are cut off from the floor (rows 4..5) by at least one wall row.
    for (let x = 0; x < 7; x++) {
      expect(v.has(cellKey(c(x, 0)))).toBe(true)
      expect(v.has(cellKey(c(x, 1)))).toBe(true)
      expect(v.has(cellKey(c(x, 2)))).toBe(true)
      expect(v.has(cellKey(c(x, 3)))).toBe(false) // next to row 4
    }
  })

  it('the heart template has void outside the heart, and every void cell is a wall', () => {
    const maze = getMazeTemplate('heart')!.maze
    const v = voidWalls(maze)
    expect(v.size).toBeGreaterThan(20)
    for (const k of v) expect(maze.walls).toContain(k)
    expect(v.has('0,14')).toBe(true) // bottom-left corner, far from the heart
    expect(v.has('6,13')).toBe(false) // the stem's walls stay full height
  })
})

describe('run clock', () => {
  it('counts only while running and keeps the time across pauses', () => {
    let clock = NEW_CLOCK
    expect(clockElapsed(clock, 500)).toBe(0)
    clock = startClock(clock, 1000)
    expect(clockElapsed(clock, 1500)).toBe(500)
    clock = pauseClock(clock, 2000) // page hidden
    expect(clockElapsed(clock, 9000)).toBe(1000)
    clock = startClock(clock, 10_000) // visible again
    expect(clockElapsed(clock, 10_250)).toBe(1250)
  })

  it('starting a running clock or pausing a stopped one changes nothing', () => {
    const running = startClock(NEW_CLOCK, 100)
    expect(startClock(running, 900)).toBe(running)
    expect(pauseClock(NEW_CLOCK, 900)).toBe(NEW_CLOCK)
  })

  it('never goes backwards when the time source does', () => {
    const running = startClock(NEW_CLOCK, 1000)
    expect(clockElapsed(running, 900)).toBe(0)
    expect(clockElapsed(pauseClock(running, 900), 2000)).toBe(0)
  })
})

describe('rateMazeRun', () => {
  const maze = getMazeTemplate('easy')!.maze as Maze
  const { threeSec, twoSec } = starThresholds(maze)

  it('rates like rateRun without hints', () => {
    for (const ms of [0, threeSec * 1000, threeSec * 1000 + 1, twoSec * 1000, twoSec * 1000 + 1]) {
      expect(rateMazeRun(maze, ms, 0)).toBe(rateRun(maze, ms))
    }
  })

  it('caps the stars at two once a hint was used', () => {
    expect(rateMazeRun(maze, 1000, 1)).toBe(2)
    expect(rateMazeRun(maze, twoSec * 1000 + 1, 3)).toBe(1)
  })

  it('block steps rate against their own limits, blended by the share of cells stepped', () => {
    const L = solve(maze)!.length
    expect(starThresholds(maze, 0)).toEqual(starThresholds(maze))
    expect(starThresholds(maze, 1)).toEqual({ threeSec: L * STEP_STAR3_SEC_PER_CELL, twoSec: L * STEP_STAR2_SEC_PER_CELL })
    expect(starThresholds(maze, 0.5).threeSec).toBeCloseTo((L * (STAR3_SEC_PER_CELL + STEP_STAR3_SEC_PER_CELL)) / 2)
    // 2 s per cell: three stars driven, two stepped.
    expect(rateMazeRun(maze, L * 2000, 0, 0)).toBe(3)
    expect(rateMazeRun(maze, L * 2000, 0, 1)).toBe(2)
    // Straight to the exit at the step speed, with a pause at every cell as long as the step: three.
    expect(rateMazeRun(maze, (L - 1) * 2 * STEP_SECONDS * 1000, 0, 1)).toBe(3)
  })
})

describe('isBetterRecord', () => {
  const rec = (timeMs: number, stars: 1 | 2 | 3, coins: number) => ({ timeMs, stars, coins })
  it('the first run is always the record', () => {
    expect(isBetterRecord(undefined, rec(99_000, 1, 0))).toBe(true)
  })
  it('more stars win, then a faster time, then more coins', () => {
    expect(isBetterRecord(rec(10_000, 2, 0), rec(12_000, 3, 0))).toBe(true)
    expect(isBetterRecord(rec(12_000, 3, 0), rec(9_000, 2, 0))).toBe(false) // faster, but with a hint
    expect(isBetterRecord(rec(10_000, 3, 0), rec(9_999, 3, 0))).toBe(true)
    expect(isBetterRecord(rec(10_000, 3, 4), rec(10_001, 3, 5))).toBe(false)
    expect(isBetterRecord(rec(10_000, 3, 1), rec(10_000, 3, 2))).toBe(true)
    expect(isBetterRecord(rec(10_000, 3, 2), rec(10_000, 3, 2))).toBe(false)
  })
})

describe('hints', () => {
  it('show for a few seconds, then cool down before the next one', () => {
    expect(hintReady(null, 0)).toBe(true)
    expect(hintShowing(null, 0)).toBe(false)
    expect(hintShowing(1000, 1000)).toBe(true)
    expect(hintShowing(1000, 1000 + HINT_SHOW_MS - 1)).toBe(true)
    expect(hintShowing(1000, 1000 + HINT_SHOW_MS)).toBe(false)
    expect(hintReady(1000, 1000 + HINT_COOLDOWN_MS - 1)).toBe(false)
    expect(hintReady(1000, 1000 + HINT_COOLDOWN_MS)).toBe(true)
    expect(HINT_COOLDOWN_MS).toBeGreaterThan(HINT_SHOW_MS)
  })

  it('arrows point along the way, from the car cell onwards', () => {
    const arrows = hintArrows(c(1, 1), [c(2, 1), c(2, 2), c(1, 2)])
    expect(arrows.map((a) => a.cell)).toEqual([c(2, 1), c(2, 2), c(1, 2)])
    const dirs = arrows.map((a) => forwardOf(a.yaw).map((v) => Math.round(v) + 0))
    expect(dirs).toEqual([
      [1, 0], // east
      [0, 1], // south (+Z)
      [-1, 0], // west
    ])
  })

  it('arrows follow the solved path of a template', () => {
    const maze = getMazeTemplate('easy')!.maze as Maze
    const path = solve(maze)!
    const arrows = hintArrows(path[0], path.slice(1, 5))
    arrows.forEach((a, i) => {
      const [fx, fz] = forwardOf(a.yaw)
      const prev = path[i]
      expect(Math.round(fx) + 0).toBe(a.cell.cx - prev.cx)
      expect(Math.round(fz) + 0).toBe(a.cell.cz - prev.cz)
    })
    expect(hintArrows(path[0], [])).toEqual([])
  })
})
