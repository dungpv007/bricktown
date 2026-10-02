import { create } from 'zustand'
import * as sfx from '../audio/sfx'
import { nextHintCells, type Cell, type Maze } from '../core/maze'
import {
  HINT_CELLS,
  NEW_CLOCK,
  clockElapsed,
  enterCell,
  hintArrows,
  hintReady,
  hintShowing,
  isBetterRecord,
  pauseClock,
  rateMazeRun,
  startClock,
  type HintArrow,
  type RunClock,
} from '../core/mazeRun'
import type { MazeRecord } from '../core/types'
import { useGame } from './useGame'

/** Tilted top-down view (the car moves block by block), or behind the car (driven with physics). */
export type MazeCamera = 'top' | 'chase'
/** How the car reached a cell: driven (physics) or one block step (top-down view). */
export type MazeMove = 'drive' | 'step'
/** Waiting for the first movement, driving (the clock runs), out of the maze. */
export type MazeRunPhase = 'ready' | 'running' | 'won'

export interface MazeRunResult {
  timeMs: number
  stars: 1 | 2 | 3
  coins: number
  totalCoins: number
  /** The best run before this one, if any. */
  best: MazeRecord | undefined
  /** This run is the new best (and was saved). */
  newRecord: boolean
}

export interface MazeRunState {
  maze: Maze | null
  /** Where the best run is saved (`useGame.mazeRecords`); null: nowhere. */
  recordKey: string | null
  phase: MazeRunPhase
  clock: RunClock
  /** "cx,cz" keys of the coins still on the floor. */
  coinsLeft: string[]
  /** The cell under the car's centre. */
  carCell: Cell | null
  hintsUsed: number
  /** Cells reached this run by block steps and by driving: the stars blend their time limits. */
  stepCells: number
  driveCells: number
  lastHintAt: number | null
  /** Arrows on the floor while a hint shows, else empty. */
  hintArrows: HintArrow[]
  /** The kid's camera choice; kept across runs. */
  camera: MazeCamera
  result: MazeRunResult | null
  /** A fresh run of `maze` from its entry. */
  begin: (maze: Maze, recordKey: string | null) => void
  /** Milliseconds on the clock at `now`. */
  elapsed: (now: number) => number
  /** The car started moving: the clock starts (once). */
  startIfReady: (now: number) => void
  /**
   * The car's centre is in `cell` now (`via` a block step or driving, default driving): picks up
   * coins, finishes at the exit, moves the hint along. The same cell again does nothing.
   */
  carAt: (cell: Cell, now: number, via?: MazeMove) => void
  /** The app was hidden / shown again: the clock pauses meanwhile. */
  setHidden: (hidden: boolean, now: number) => void
  /** Shows the way for a few seconds; false while the last hint is still cooling down. */
  askHint: (now: number) => boolean
  /** Takes the hint arrows away once their time is up. */
  tick: (now: number) => void
  toggleCamera: () => void
}

const sameCell = (a: Cell | null, b: Cell) => a !== null && a.cx === b.cx && a.cz === b.cz

/** The arrows from `cell` on (one shortest-path search: call only when the cell changes or a hint starts). */
const arrowsFrom = (maze: Maze, cell: Cell) => hintArrows(cell, nextHintCells(maze, cell, HINT_CELLS))

export const useMazeRun = create<MazeRunState>()((set, get) => {
  const finish = (now: number) => {
    const s = get()
    if (!s.maze) return
    const clock = pauseClock(startClock(s.clock, now), now)
    const timeMs = clockElapsed(clock, now)
    const coins = s.maze.coins.length - s.coinsLeft.length
    const stepShare = s.stepCells / Math.max(1, s.stepCells + s.driveCells)
    const run: MazeRecord = { timeMs, stars: rateMazeRun(s.maze, timeMs, s.hintsUsed, stepShare), coins }
    const best = s.recordKey === null ? undefined : useGame.getState().data.mazeRecords[s.recordKey]
    const newRecord = s.recordKey !== null && isBetterRecord(best, run)
    if (newRecord && s.recordKey !== null) useGame.getState().setMazeRecord(s.recordKey, run)
    sfx.fanfare()
    set({ phase: 'won', clock, hintArrows: [], result: { ...run, totalCoins: s.maze.coins.length, best, newRecord } })
  }

  return {
    maze: null,
    recordKey: null,
    phase: 'ready',
    clock: NEW_CLOCK,
    coinsLeft: [],
    carCell: null,
    hintsUsed: 0,
    stepCells: 0,
    driveCells: 0,
    lastHintAt: null,
    hintArrows: [],
    camera: 'top',
    result: null,

    begin: (maze, recordKey) =>
      set({
        maze,
        recordKey,
        phase: 'ready',
        clock: NEW_CLOCK,
        coinsLeft: [...maze.coins],
        carCell: maze.entry,
        hintsUsed: 0,
        stepCells: 0,
        driveCells: 0,
        lastHintAt: null,
        hintArrows: [],
        result: null,
      }),

    elapsed: (now) => clockElapsed(get().clock, now),

    startIfReady: (now) => {
      if (get().phase !== 'ready') return
      set({ phase: 'running', clock: startClock(get().clock, now) })
    },

    carAt: (cell, now, via = 'drive') => {
      const s = get()
      if (!s.maze || s.phase === 'won' || sameCell(s.carCell, cell)) return
      if (s.phase === 'ready') get().startIfReady(now)
      const { coinsLeft, coin, exit } = enterCell(s.maze, s.coinsLeft, cell)
      if (coin) sfx.coin()
      const arrows = hintShowing(s.lastHintAt, now) ? arrowsFrom(s.maze, cell) : s.hintArrows
      const counted = via === 'step' ? { stepCells: s.stepCells + 1 } : { driveCells: s.driveCells + 1 }
      set({ carCell: cell, coinsLeft, hintArrows: arrows, ...counted })
      if (exit) finish(now)
    },

    setHidden: (hidden, now) => {
      const s = get()
      if (hidden) set({ clock: pauseClock(s.clock, now) })
      else if (s.phase === 'running') set({ clock: startClock(s.clock, now) })
    },

    askHint: (now) => {
      const s = get()
      if (!s.maze || !s.carCell || s.phase === 'won' || !hintReady(s.lastHintAt, now)) return false
      set({ hintsUsed: s.hintsUsed + 1, lastHintAt: now, hintArrows: arrowsFrom(s.maze, s.carCell) })
      return true
    },

    tick: (now) => {
      const s = get()
      if (s.hintArrows.length > 0 && !hintShowing(s.lastHintAt, now)) set({ hintArrows: [] })
    },

    toggleCamera: () => set({ camera: get().camera === 'top' ? 'chase' : 'top' }),
  }
})
