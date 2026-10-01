import { beforeEach, describe, expect, it } from 'vitest'
import { getMazeTemplate } from '../content/mazes'
import { solve, type Maze } from '../core/maze'
import { HINT_CELLS, HINT_COOLDOWN_MS, HINT_SHOW_MS } from '../core/mazeRun'
import { createEmptySave } from '../core/serialize'
import { useGame } from './useGame'
import { useMazeRun } from './useMazeRun'

const easy: Maze = { ...getMazeTemplate('easy')!.maze, id: 'tpl:easy', createdAt: 0, updatedAt: 0 }
const path = solve(easy)!
const run = () => useMazeRun.getState()
const KEY = 'tpl:easy'

/** Drives along the solved path from cell `from` to `to` (indices), one cell every `stepMs`. */
function driveAlong(from: number, to: number, start: number, stepMs = 1000): number {
  let now = start
  for (let i = from; i <= to; i++) {
    run().carAt(path[i], now)
    now += stepMs
  }
  return now - stepMs
}

beforeEach(() => {
  useGame.setState({ data: createEmptySave() })
  run().begin(easy, KEY)
})

describe('useMazeRun', () => {
  it('starts ready at the entry with every coin to find', () => {
    expect(run().phase).toBe('ready')
    expect(run().coinsLeft).toEqual(easy.coins)
    expect(run().carCell).toEqual(easy.entry)
    expect(run().elapsed(5000)).toBe(0)
  })

  it('the clock starts on the first movement and pauses while the app is hidden', () => {
    run().startIfReady(1000)
    expect(run().phase).toBe('running')
    run().startIfReady(4000) // already running: no restart
    expect(run().elapsed(3000)).toBe(2000)
    run().setHidden(true, 3000)
    expect(run().elapsed(60_000)).toBe(2000)
    run().setHidden(false, 60_000)
    expect(run().elapsed(61_000)).toBe(3000)
  })

  it('a hidden app does not start a run that has not begun', () => {
    run().setHidden(false, 1000)
    expect(run().phase).toBe('ready')
    expect(run().elapsed(5000)).toBe(0)
  })

  it('leaving the entry cell starts the clock even without the pedals (e.g. a push)', () => {
    run().carAt(path[1], 2000)
    expect(run().phase).toBe('running')
    expect(run().elapsed(2500)).toBe(500)
  })

  it('collects a coin when the car reaches its cell', () => {
    const [coin, ...rest] = easy.coins
    const [cx, cz] = coin.split(',').map(Number)
    run().carAt({ cx, cz }, 1000)
    expect(run().coinsLeft).toEqual(rest)
    run().carAt(path[1], 2000)
    run().carAt({ cx, cz }, 3000) // already collected
    expect(run().coinsLeft).toEqual(rest)
  })

  it('reaching the exit wins: time, stars, coins, and the record is saved', () => {
    run().startIfReady(0)
    const end = driveAlong(1, path.length - 1, 500, 500)
    expect(run().phase).toBe('won')
    const result = run().result!
    expect(result.timeMs).toBe(end)
    expect(result.stars).toBe(3) // 0.5 s per cell is well under the three-star pace
    expect(result.totalCoins).toBe(easy.coins.length)
    expect(result.coins).toBe(easy.coins.length - run().coinsLeft.length)
    expect(result.newRecord).toBe(true)
    expect(result.best).toBeUndefined()
    expect(useGame.getState().data.mazeRecords[KEY]).toEqual({ timeMs: end, stars: 3, coins: result.coins })
    // The clock stops at the finish.
    expect(run().elapsed(end + 99_000)).toBe(end)
    // Nothing changes after the win.
    run().carAt(path[0], end + 1000)
    expect(run().result).toBe(result)
  })

  it('a slower run keeps the old record', () => {
    useGame.getState().setMazeRecord(KEY, { timeMs: 1000, stars: 3, coins: 0 })
    run().startIfReady(0)
    driveAlong(1, path.length - 1, 10_000, 10_000)
    const result = run().result!
    expect(result.newRecord).toBe(false)
    expect(result.best).toEqual({ timeMs: 1000, stars: 3, coins: 0 })
    expect(useGame.getState().data.mazeRecords[KEY]).toEqual({ timeMs: 1000, stars: 3, coins: 0 })
  })

  it('without a record key (nothing to save) the run still ends', () => {
    run().begin(easy, null)
    driveAlong(1, path.length - 1, 1000)
    expect(run().phase).toBe('won')
    expect(useGame.getState().data.mazeRecords).toEqual({})
  })

  describe('hints', () => {
    it('show arrows along the way from the car cell, then hide; cool down between hints', () => {
      run().carAt(path[2], 1000)
      expect(run().askHint(1000)).toBe(true)
      expect(run().hintsUsed).toBe(1)
      expect(run().hintArrows.map((a) => a.cell)).toEqual(path.slice(3, 3 + HINT_CELLS))
      expect(run().askHint(2000)).toBe(false) // cooling down
      expect(run().hintsUsed).toBe(1)
      run().tick(1000 + HINT_SHOW_MS - 1)
      expect(run().hintArrows).toHaveLength(HINT_CELLS)
      run().tick(1000 + HINT_SHOW_MS)
      expect(run().hintArrows).toEqual([])
      expect(run().askHint(1000 + HINT_COOLDOWN_MS)).toBe(true)
      expect(run().hintsUsed).toBe(2)
    })

    it('the arrows follow the car while they show, recomputed only when its cell changes', () => {
      run().askHint(0)
      const first = run().hintArrows
      run().carAt(easy.entry!, 100) // same cell: nothing recomputed
      expect(run().hintArrows).toBe(first)
      run().carAt(path[1], 200)
      expect(run().hintArrows.map((a) => a.cell)).toEqual(path.slice(2, 2 + HINT_CELLS))
      run().tick(HINT_SHOW_MS)
      run().carAt(path[2], HINT_SHOW_MS + 100) // hidden again: no arrows come back
      expect(run().hintArrows).toEqual([])
    })

    it('using a hint caps the stars at two', () => {
      run().startIfReady(0)
      run().askHint(0)
      driveAlong(1, path.length - 1, 100, 100)
      expect(run().result!.stars).toBe(2)
    })
  })

  it('the camera toggles between top-down and chase, and keeps the choice for the next run', () => {
    expect(run().camera).toBe('top')
    run().toggleCamera()
    expect(run().camera).toBe('chase')
    run().begin(easy, KEY)
    expect(run().camera).toBe('chase')
    run().toggleCamera()
    expect(run().camera).toBe('top')
  })
})
