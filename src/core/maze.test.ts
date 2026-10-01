import { describe, expect, it } from 'vitest'
import {
  cellKey,
  clearDoor,
  createEmptyMaze,
  isBorder,
  isCorner,
  isPlayable,
  nextHintCells,
  neighbors4,
  paintWalls,
  parseCellKey,
  playabilityError,
  rateRun,
  setEntry,
  setExit,
  solve,
  starThresholds,
  toggleCoin,
  toggleWall,
  STAR3_SEC_PER_CELL,
  STAR2_SEC_PER_CELL,
  type Maze,
} from './maze'

const c = (cx: number, cz: number) => ({ cx, cz })

function ok(r: ReturnType<typeof setEntry>): Maze {
  if ('error' in r) throw new Error(r.error)
  return r.maze
}

/** 7x7 open room (interior all path) with a door on the west and east border at row 3. */
function openRoom(): Maze {
  return ok(setExit(ok(setEntry(createEmptyMaze(7, 7), c(0, 3))), c(6, 3)))
}

describe('cell keys', () => {
  it('round-trips', () => {
    expect(cellKey(c(3, 4))).toBe('3,4')
    expect(parseCellKey('3,4')).toEqual(c(3, 4))
  })
})

describe('createEmptyMaze', () => {
  it('has a closed outer ring and an open interior', () => {
    const m = createEmptyMaze(7, 9)
    expect(m.w).toBe(7)
    expect(m.h).toBe(9)
    expect(m.walls).toHaveLength(7 * 2 + (9 - 2) * 2)
    expect(m.walls).toContain('0,0')
    expect(m.walls).toContain('6,8')
    expect(m.walls).not.toContain('3,3')
    expect(m.entry).toBeNull()
    expect(m.exit).toBeNull()
    expect(m.coins).toEqual([])
    expect(m.floorColor).toBe(24)
    expect(m.id).toBeTruthy()
  })
  it('applies options', () => {
    const m = createEmptyMaze(7, 7, { id: 'x', name: 'N', wallColor: 3, floorColor: 5, now: 42 })
    expect(m).toMatchObject({ id: 'x', name: 'N', wallColor: 3, floorColor: 5, createdAt: 42, updatedAt: 42 })
  })
  it('rejects even or out-of-range sizes', () => {
    expect(() => createEmptyMaze(8, 7)).toThrow(RangeError)
    expect(() => createEmptyMaze(7, 5)).toThrow(RangeError)
    expect(() => createEmptyMaze(23, 7)).toThrow(RangeError)
    expect(() => createEmptyMaze(21, 21)).not.toThrow()
  })
})

describe('geometry helpers', () => {
  const dims = { w: 7, h: 7 }
  it('isBorder / isCorner', () => {
    expect(isBorder(dims, c(0, 3))).toBe(true)
    expect(isBorder(dims, c(3, 6))).toBe(true)
    expect(isBorder(dims, c(3, 3))).toBe(false)
    expect(isBorder(dims, c(7, 3))).toBe(false) // outside the grid
    expect(isCorner(dims, c(0, 0))).toBe(true)
    expect(isCorner(dims, c(6, 6))).toBe(true)
    expect(isCorner(dims, c(0, 3))).toBe(false)
  })
  it('neighbors4 stays inside the grid', () => {
    expect(neighbors4(dims, c(3, 3))).toHaveLength(4)
    expect(neighbors4(dims, c(0, 0))).toEqual([c(1, 0), c(0, 1)])
  })
})

describe('toggleWall / paintWalls', () => {
  it('adds and removes walls without mutating', () => {
    const m = createEmptyMaze(7, 7)
    const w = toggleWall(m, c(3, 3), true)
    expect(w.walls).toContain('3,3')
    expect(m.walls).not.toContain('3,3')
    expect(toggleWall(w, c(3, 3), false).walls).not.toContain('3,3')
  })
  it('is idempotent', () => {
    const m = toggleWall(createEmptyMaze(7, 7), c(3, 3), true)
    expect(toggleWall(m, c(3, 3), true).walls.filter((k) => k === '3,3')).toHaveLength(1)
  })
  it('removes a coin when walling its cell', () => {
    let m = toggleCoin(createEmptyMaze(7, 7), c(3, 3))
    expect(m.coins).toEqual(['3,3'])
    m = toggleWall(m, c(3, 3), true)
    expect(m.coins).toEqual([])
  })
  it('is a no-op on entry and exit cells and outside the grid', () => {
    const m = openRoom()
    expect(toggleWall(m, c(0, 3), true)).toEqual(m)
    expect(toggleWall(m, c(6, 3), true)).toEqual(m)
    expect(toggleWall(m, c(9, 9), true)).toEqual(m)
    expect(toggleWall(m, c(-1, 2), true)).toEqual(m)
  })
  it('never removes outer-ring walls, so an eraser stroke cannot punch holes in the border', () => {
    const m = openRoom()
    const edge = [c(0, 1), c(0, 2), c(3, 0), c(6, 5), c(3, 6), c(0, 0)]
    expect(toggleWall(m, c(0, 1), false)).toBe(m)
    const erased = paintWalls(m, edge, false)
    expect(erased).toBe(m)
    for (const cell of edge) expect(erased.walls).toContain(cellKey(cell))
    // the doors are still the only gaps
    expect(playabilityError(erased)).toBeNull()
  })
  it('paintWalls applies a whole stroke', () => {
    const m = paintWalls(createEmptyMaze(7, 7), [c(2, 2), c(3, 2), c(4, 2)], true)
    expect(m.walls).toEqual(expect.arrayContaining(['2,2', '3,2', '4,2']))
    const cleared = paintWalls(m, [c(2, 2), c(4, 2)], false)
    expect(cleared.walls).not.toContain('2,2')
    expect(cleared.walls).toContain('3,2')
  })
})

describe('setEntry / setExit', () => {
  it('carves a door when set on a border wall cell', () => {
    const m = createEmptyMaze(7, 7)
    expect(m.walls).toContain('0,3')
    const r = ok(setEntry(m, c(0, 3)))
    expect(r.entry).toEqual(c(0, 3))
    expect(r.walls).not.toContain('0,3')
    const e = ok(setExit(r, c(6, 3)))
    expect(e.exit).toEqual(c(6, 3))
    expect(e.walls).not.toContain('6,3')
  })
  it('rejects non-border and corner cells', () => {
    const m = createEmptyMaze(7, 7)
    expect(setEntry(m, c(3, 3))).toEqual({ error: 'not_border' })
    expect(setExit(m, c(9, 9))).toEqual({ error: 'not_border' })
    expect(setEntry(m, c(0, 0))).toEqual({ error: 'corner' })
    expect(setExit(m, c(6, 6))).toEqual({ error: 'corner' })
  })
  it('rejects the same cell for entry and exit', () => {
    const m = ok(setEntry(createEmptyMaze(7, 7), c(0, 3)))
    expect(setExit(m, c(0, 3))).toEqual({ error: 'same_cell' })
    const n = ok(setExit(createEmptyMaze(7, 7), c(6, 3)))
    expect(setEntry(n, c(6, 3))).toEqual({ error: 'same_cell' })
  })
  it('moving the door closes the old one and drops a coin on the new cell', () => {
    let m = ok(setEntry(createEmptyMaze(7, 7), c(0, 3)))
    m = toggleCoin(m, c(1, 3))
    m = { ...m, coins: [...m.coins, '0,5'] } // a stray coin on a would-be door cell
    const moved = ok(setEntry(m, c(0, 5)))
    expect(moved.entry).toEqual(c(0, 5))
    expect(moved.walls).toContain('0,3')
    expect(moved.walls).not.toContain('0,5')
    expect(moved.coins).toEqual(['1,3'])
  })
  it('setting the current entry again is harmless', () => {
    const m = ok(setEntry(createEmptyMaze(7, 7), c(0, 3)))
    expect(ok(setEntry(m, c(0, 3)))).toBe(m)
    const e = ok(setExit(m, c(6, 3)))
    expect(ok(setExit(e, c(6, 3)))).toBe(e)
  })
  it('does not report is_wall: a wall border cell is simply carved', () => {
    const m = createEmptyMaze(7, 7)
    expect('error' in setEntry(m, c(0, 5))).toBe(false)
  })
})

describe('clearDoor', () => {
  it('re-walls the door cell and unsets it', () => {
    const m = openRoom()
    const noEntry = clearDoor(m, 'entry')
    expect(noEntry.entry).toBeNull()
    expect(noEntry.walls).toContain('0,3')
    expect(noEntry.exit).toEqual(c(6, 3))
    const noExit = clearDoor(m, 'exit')
    expect(noExit.exit).toBeNull()
    expect(noExit.walls).toContain('6,3')
    expect(playabilityError(noEntry)).toBe('no_entry')
    expect(playabilityError(noExit)).toBe('no_exit')
  })
  it('is a no-op (same reference) when the door is not set', () => {
    const m = createEmptyMaze(7, 7)
    expect(clearDoor(m, 'entry')).toBe(m)
    expect(clearDoor(m, 'exit')).toBe(m)
  })
  it('does not mutate its input', () => {
    const m = openRoom()
    clearDoor(m, 'entry')
    expect(m.entry).toEqual(c(0, 3))
    expect(m.walls).not.toContain('0,3')
  })
})

describe('toggleCoin', () => {
  it('toggles on path cells only', () => {
    const m = openRoom()
    expect(toggleCoin(m, c(3, 3)).coins).toEqual(['3,3'])
    expect(toggleCoin(toggleCoin(m, c(3, 3)), c(3, 3)).coins).toEqual([])
    expect(toggleCoin(m, c(0, 0))).toEqual(m) // wall
    expect(toggleCoin(m, c(0, 3))).toEqual(m) // entry
    expect(toggleCoin(m, c(6, 3))).toEqual(m) // exit
    expect(toggleCoin(m, c(9, 9))).toEqual(m) // outside
  })
})

describe('solve / playability', () => {
  it('finds a shortest path through an open room', () => {
    const p = solve(openRoom())
    expect(p).not.toBeNull()
    expect(p![0]).toEqual(c(0, 3))
    expect(p![p!.length - 1]).toEqual(c(6, 3))
    expect(p).toHaveLength(7)
  })
  it('routes around walls', () => {
    const m = paintWalls(openRoom(), [c(3, 1), c(3, 2), c(3, 3), c(3, 4)], true)
    const p = solve(m)!
    expect(p).toHaveLength(11) // down to row 5 and back up: 7 + 2*2
    const walls = new Set(m.walls)
    expect(p.every((q) => !walls.has(cellKey(q)))).toBe(true)
    for (let i = 1; i < p.length; i++) {
      expect(Math.abs(p[i].cx - p[i - 1].cx) + Math.abs(p[i].cz - p[i - 1].cz)).toBe(1)
    }
  })
  it('solves from an arbitrary cell and handles from === exit', () => {
    const m = openRoom()
    expect(solve(m, c(5, 3))).toEqual([c(5, 3), c(6, 3)])
    expect(solve(m, c(6, 3))).toEqual([c(6, 3)])
  })
  it('returns null from a wall cell, without an exit, or when blocked', () => {
    const m = openRoom()
    expect(solve(m, c(0, 0))).toBeNull()
    expect(solve(createEmptyMaze(7, 7))).toBeNull()
    const blocked = paintWalls(m, [c(3, 1), c(3, 2), c(3, 3), c(3, 4), c(3, 5)], true)
    expect(solve(blocked)).toBeNull()
  })
  it('playabilityError reports the first problem', () => {
    const empty = createEmptyMaze(7, 7)
    expect(playabilityError(empty)).toBe('no_entry')
    const e = ok(setEntry(empty, c(0, 3)))
    expect(playabilityError(e)).toBe('no_exit')
    const full = ok(setExit(e, c(6, 3)))
    expect(playabilityError(full)).toBeNull()
    expect(isPlayable(full)).toBe(true)
    const blocked = paintWalls(full, [c(3, 1), c(3, 2), c(3, 3), c(3, 4), c(3, 5)], true)
    expect(playabilityError(blocked)).toBe('no_path')
    expect(isPlayable(blocked)).toBe(false)
  })
})

describe('nextHintCells', () => {
  it('returns the next cells along the shortest path, excluding the current cell', () => {
    const m = openRoom()
    expect(nextHintCells(m, c(1, 3))).toEqual([c(2, 3), c(3, 3), c(4, 3), c(5, 3)])
    expect(nextHintCells(m, c(1, 3), 2)).toEqual([c(2, 3), c(3, 3)])
  })
  it('is shorter near the exit and empty at the exit or when stuck', () => {
    const m = openRoom()
    expect(nextHintCells(m, c(5, 3))).toEqual([c(6, 3)])
    expect(nextHintCells(m, c(6, 3))).toEqual([])
    expect(nextHintCells(m, c(0, 0))).toEqual([])
  })
})

describe('stars', () => {
  it('thresholds scale with the shortest path length', () => {
    const t = starThresholds(openRoom()) // L = 7
    expect(t.threeSec).toBeCloseTo(7 * STAR3_SEC_PER_CELL)
    expect(t.twoSec).toBeCloseTo(7 * STAR2_SEC_PER_CELL)
    expect(t.threeSec).toBeLessThan(t.twoSec)
  })
  it('rateRun maps time to 1..3 stars with inclusive limits', () => {
    const m = openRoom()
    const { threeSec, twoSec } = starThresholds(m)
    expect(rateRun(m, 1000)).toBe(3)
    expect(rateRun(m, threeSec * 1000)).toBe(3)
    expect(rateRun(m, threeSec * 1000 + 1)).toBe(2)
    expect(rateRun(m, twoSec * 1000)).toBe(2)
    expect(rateRun(m, twoSec * 1000 + 1)).toBe(1)
    expect(rateRun(m, 10 * 60 * 1000)).toBe(1)
  })
  it('an unsolvable maze never rates above one star', () => {
    expect(rateRun(createEmptyMaze(7, 7), 1)).toBe(1)
  })
})
