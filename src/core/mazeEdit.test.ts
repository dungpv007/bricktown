import { describe, expect, it } from 'vitest'
import { cellKey, createEmptyMaze, isBorder, isPlayable, setEntry, setExit, toggleCoin, toggleWall, type Cell, type Maze } from './maze'
import { cellsBetween, resizeMaze } from './mazeEdit'

const c = (cx: number, cz: number): Cell => ({ cx, cz })

function withDoors(m: Maze, entry: Cell, exit: Cell): Maze {
  const a = setEntry(m, entry)
  if (!('maze' in a)) throw new Error(a.error)
  const b = setExit(a.maze, exit)
  if (!('maze' in b)) throw new Error(b.error)
  return b.maze
}

const borderKeys = (w: number, h: number) => {
  const out: string[] = []
  for (let cz = 0; cz < h; cz++) for (let cx = 0; cx < w; cx++) if (isBorder({ w, h }, c(cx, cz))) out.push(cellKey(c(cx, cz)))
  return out
}

describe('cellsBetween', () => {
  it('is just the cell when both ends are the same', () => {
    expect(cellsBetween(c(2, 3), c(2, 3))).toEqual([c(2, 3)])
  })

  it('walks a straight line in either direction, both ends included', () => {
    expect(cellsBetween(c(1, 2), c(4, 2))).toEqual([c(1, 2), c(2, 2), c(3, 2), c(4, 2)])
    expect(cellsBetween(c(3, 5), c(3, 3))).toEqual([c(3, 5), c(3, 4), c(3, 3)])
  })

  it('never jumps diagonally: every step moves to a 4-neighbour', () => {
    for (const [a, b] of [
      [c(0, 0), c(5, 3)],
      [c(6, 1), c(1, 4)],
      [c(2, 2), c(3, 3)],
      [c(4, 0), c(0, 9)],
    ]) {
      const line = cellsBetween(a, b)
      expect(line[0]).toEqual(a)
      expect(line[line.length - 1]).toEqual(b)
      for (let i = 1; i < line.length; i++) {
        expect(Math.abs(line[i].cx - line[i - 1].cx) + Math.abs(line[i].cz - line[i - 1].cz)).toBe(1)
      }
      expect(line).toHaveLength(Math.abs(a.cx - b.cx) + Math.abs(a.cz - b.cz) + 1)
    }
  })
})

describe('resizeMaze', () => {
  it('returns the same maze for the same size and rejects sizes that are not allowed', () => {
    const m = createEmptyMaze(7, 7)
    expect(resizeMaze(m, 7, 7)).toBe(m)
    expect(() => resizeMaze(m, 8, 8)).toThrow(RangeError)
    expect(() => resizeMaze(m, 23, 23)).toThrow(RangeError)
  })

  it('growing keeps the inside, opens the old outer ring and moves east / south doors to the new edge', () => {
    let m = createEmptyMaze(7, 7, { id: 'x', name: 'Mine', wallColor: 3, now: 10 })
    m = toggleWall(m, c(2, 2), true)
    m = toggleCoin(m, c(4, 4))
    m = withDoors(m, c(0, 3), c(6, 5))
    const g = resizeMaze(m, 11, 9)
    expect(g).toMatchObject({ id: 'x', name: 'Mine', wallColor: 3, w: 11, h: 9, createdAt: 10 })
    expect(g.entry).toEqual(c(0, 3))
    expect(g.exit).toEqual(c(10, 5))
    const walls = new Set(g.walls)
    expect(walls.has('2,2')).toBe(true)
    expect(walls.has('6,3')).toBe(false) // was the old east border
    expect(walls.has('3,6')).toBe(false) // was the old south border
    for (const k of borderKeys(11, 9)) {
      if (k !== '0,3' && k !== '10,5') expect(walls.has(k)).toBe(true)
    }
    expect(walls.has('0,3') || walls.has('10,5')).toBe(false)
    expect(g.coins).toEqual(['4,4'])
    expect(isPlayable(g)).toBe(true)
  })

  it('shrinking drops what is cut off, and doors that no longer fit on the edge', () => {
    let m = createEmptyMaze(11, 11)
    m = toggleWall(m, c(3, 3), true)
    m = toggleWall(m, c(8, 8), true)
    m = toggleCoin(m, c(2, 2))
    m = toggleCoin(m, c(9, 2))
    m = withDoors(m, c(0, 6), c(10, 3)) // entry lands on a corner of 7x7, exit moves to (6, 3)
    const s = resizeMaze(m, 7, 7)
    expect(s.entry).toBeNull()
    expect(s.exit).toEqual(c(6, 3))
    const walls = new Set(s.walls)
    expect(walls.has('3,3')).toBe(true)
    expect([...walls].every((k) => k.split(',').map(Number).every((v) => v >= 0 && v < 7))).toBe(true)
    expect(walls.has('0,6')).toBe(true) // the corner is solid wall again
    expect(walls.has('6,3')).toBe(false)
    expect(s.coins).toEqual(['2,2'])
    expect(s.walls.length).toBe(new Set(s.walls).size)
  })

  it('drops a door whose row or column is outside the new grid', () => {
    const m = withDoors(createEmptyMaze(11, 11), c(5, 0), c(10, 9))
    const s = resizeMaze(m, 7, 7)
    expect(s.entry).toEqual(c(5, 0))
    expect(s.exit).toBeNull()
  })

  it('does not change the input', () => {
    const m = withDoors(createEmptyMaze(7, 7), c(0, 3), c(6, 3))
    const copy = structuredClone(m)
    resizeMaze(m, 9, 9)
    expect(m).toEqual(copy)
  })
})
