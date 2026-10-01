import { describe, expect, it } from 'vitest'
import { MAZE_TEMPLATES, getMazeTemplate } from './index'
import { mazeFromAscii } from './ascii'
import {
  MAZE_MAX_SIZE,
  MAZE_MIN_SIZE,
  cellKey,
  isBorder,
  isCorner,
  isPlayable,
  neighbors4,
  parseCellKey,
  solve,
  type Maze,
  type MazeTemplate,
} from '../../core/maze'
import { COLORS } from '../../core/colors'

type Layout = MazeTemplate['maze']

const asMaze = (m: Layout): Maze => ({ ...m, id: 't', createdAt: 0, updatedAt: 0 })

function floorCells(m: Layout): string[] {
  const walls = new Set(m.walls)
  const out: string[] = []
  for (let cz = 0; cz < m.h; cz++) {
    for (let cx = 0; cx < m.w; cx++) if (!walls.has(cellKey({ cx, cz }))) out.push(cellKey({ cx, cz }))
  }
  return out
}

describe('mazeFromAscii', () => {
  it('parses walls, floor, doors and coins', () => {
    const rows = ['#######', 'E.o...X', '#.###.#', '#.....#', '#######', '#######', '#######']
    const m = mazeFromAscii(rows, { id: 'x', name: 'N', wallColor: 3, floorColor: 7 })
    expect(m).toMatchObject({ w: 7, h: 7, name: 'N', wallColor: 3, floorColor: 7, templateId: 'x' })
    expect(m.entry).toEqual({ cx: 0, cz: 1 })
    expect(m.exit).toEqual({ cx: 6, cz: 1 })
    expect(m.coins).toEqual(['2,1'])
    expect(m.walls).toContain('0,0')
    expect(m.walls).toContain('2,2')
    expect(m.walls).not.toContain('1,1')
    expect(m.walls).not.toContain('0,1') // the entry is floor
  })
  it('rejects ragged rows and unknown characters', () => {
    expect(() => mazeFromAscii(['###', '##'], { id: 'x', name: 'N', wallColor: 1 })).toThrow()
    expect(() => mazeFromAscii(['#?#'], { id: 'x', name: 'N', wallColor: 1 })).toThrow()
  })
})

describe('maze templates', () => {
  it('lists easy, medium, hard, spiral and heart with unique ids', () => {
    expect(MAZE_TEMPLATES.map((t) => t.id)).toEqual(['easy', 'medium', 'hard', 'spiral', 'heart'])
    expect(new Set(MAZE_TEMPLATES.map((t) => t.id)).size).toBe(MAZE_TEMPLATES.length)
  })

  it('getMazeTemplate finds by id', () => {
    expect(getMazeTemplate('heart')?.id).toBe('heart')
    expect(getMazeTemplate('nope')).toBeUndefined()
  })

  it('uses the specified sizes', () => {
    const size = (id: string) => {
      const m = getMazeTemplate(id)!.maze
      return [m.w, m.h]
    }
    expect(size('easy')).toEqual([7, 7])
    expect(size('medium')).toEqual([11, 11])
    expect(size('hard')).toEqual([15, 15])
    expect(size('spiral')).toEqual([11, 11])
    expect(size('heart')).toEqual([15, 15])
  })

  describe.each(MAZE_TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, t) => {
    const m = t.maze
    const maze = asMaze(m)
    const walls = new Set(m.walls)

    it('has localized names, a valid colour and a template id', () => {
      expect(t.name.vi.length).toBeGreaterThan(0)
      expect(t.name.en.length).toBeGreaterThan(0)
      expect(m.name.length).toBeGreaterThan(0)
      expect(COLORS[m.wallColor]).toBeDefined()
      if (m.floorColor !== undefined) expect(COLORS[m.floorColor]).toBeDefined()
      expect(m.templateId).toBe(t.id)
      expect([1, 2, 3]).toContain(t.difficulty)
    })

    it('has odd sizes in range', () => {
      for (const n of [m.w, m.h]) {
        expect(n % 2).toBe(1)
        expect(n).toBeGreaterThanOrEqual(MAZE_MIN_SIZE)
        expect(n).toBeLessThanOrEqual(MAZE_MAX_SIZE)
      }
    })

    it('has a valid entry and exit on the border', () => {
      expect(m.entry).not.toBeNull()
      expect(m.exit).not.toBeNull()
      for (const door of [m.entry!, m.exit!]) {
        expect(isBorder(m, door)).toBe(true)
        expect(isCorner(m, door)).toBe(false)
        expect(walls.has(cellKey(door))).toBe(false)
      }
      expect(cellKey(m.entry!)).not.toBe(cellKey(m.exit!))
    })

    it('is a closed box apart from the entry and exit', () => {
      const doors = new Set([cellKey(m.entry!), cellKey(m.exit!)])
      for (let cz = 0; cz < m.h; cz++) {
        for (let cx = 0; cx < m.w; cx++) {
          const k = cellKey({ cx, cz })
          if (isBorder(m, { cx, cz }) && !doors.has(k)) expect(walls.has(k)).toBe(true)
        }
      }
    })

    it('is playable and has no unreachable floor pockets', () => {
      expect(isPlayable(maze)).toBe(true)
      const seen = new Set([cellKey(m.entry!)])
      const queue = [m.entry!]
      for (let i = 0; i < queue.length; i++) {
        for (const n of neighbors4(m, queue[i])) {
          const k = cellKey(n)
          if (!walls.has(k) && !seen.has(k)) {
            seen.add(k)
            queue.push(n)
          }
        }
      }
      expect(seen.size).toBe(floorCells(m).length)
    })

    it('has coins on distinct floor cells, never on the entry or exit', () => {
      expect(m.coins.length).toBeGreaterThanOrEqual(3)
      expect(new Set(m.coins).size).toBe(m.coins.length)
      for (const k of m.coins) {
        expect(walls.has(k)).toBe(false)
        expect(k).not.toBe(cellKey(m.entry!))
        expect(k).not.toBe(cellKey(m.exit!))
      }
    })

    it('has a solution that is not a straight shot', () => {
      expect(solve(maze)!.length).toBeGreaterThan(m.w)
    })
  })

  it('the spiral is one winding corridor (no branches) that is much longer than the grid is wide', () => {
    const m = getMazeTemplate('spiral')!.maze
    const walls = new Set(m.walls)
    for (const k of floorCells(m)) {
      const open = neighbors4(m, parseCellKey(k)).filter((n) => !walls.has(cellKey(n))).length
      expect(open).toBeLessThanOrEqual(2)
    }
    expect(solve(asMaze(m))!.length).toBeGreaterThanOrEqual(45)
  })

  it('the heart is heart-shaped: floor in both top lobes, a notch between them, and a tip at the bottom', () => {
    const m = getMazeTemplate('heart')!.maze
    const walls = new Set(m.walls)
    const floor = (cx: number, cz: number) => !walls.has(cellKey({ cx, cz }))
    expect(floor(4, 1)).toBe(true) // left lobe
    expect(floor(10, 1)).toBe(true) // right lobe
    expect(floor(7, 1)).toBe(false) // notch
    expect(floor(7, 2)).toBe(false)
    expect(floor(7, 13)).toBe(true) // tip
    expect(floor(2, 13)).toBe(false) // nothing beside the tip
    expect(m.exit).toEqual({ cx: 7, cz: 14 })
  })
})
