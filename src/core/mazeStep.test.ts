import { describe, expect, it } from 'vitest'
import { getMazeTemplate } from '../content/mazes'
import { MAZE_CELL, cellKey, solve, type Cell, type Maze } from './maze'
import { cellCenterXZ, enterCell } from './mazeRun'
import {
  BUMP_SECONDS,
  STEP_SECONDS,
  TOP_VIEW_DELTA,
  advanceStepper,
  dirBetween,
  nearestDir,
  placeStepper,
  pressStep,
  snapCell,
  startStepper,
  stepTarget,
  stepYaw,
  stepperPose,
  type StepDir,
  type Stepper,
} from './mazeStep'

// '#######'
// '#....o#'
// '#.#.###'
// '#o#...#'
// '#.###.#'
// 'E..o#.X'
// '#######'
const easy: Maze = { ...getMazeTemplate('easy')!.maze, id: 'tpl:easy', createdAt: 0, updatedAt: 0 }
const c = (cx: number, cz: number): Cell => ({ cx, cz })

/** Runs the stepper on for `seconds` in small frames, collecting the events. */
function run(s: Stepper, seconds: number, held: StepDir | null = null, frame = 1 / 60) {
  const events = []
  let st = s
  for (let i = Math.round(seconds / frame); i > 0; i--) {
    const r = advanceStepper(st, easy, frame, held)
    st = r.stepper
    events.push(...r.events)
  }
  return { stepper: st, events }
}

describe('screen directions of the top-down view', () => {
  it('up is north (-Z), right is east (+X); headings face the way', () => {
    expect(TOP_VIEW_DELTA.up).toEqual({ dx: 0, dz: -1 })
    expect(TOP_VIEW_DELTA.down).toEqual({ dx: 0, dz: 1 })
    expect(TOP_VIEW_DELTA.left).toEqual({ dx: -1, dz: 0 })
    expect(TOP_VIEW_DELTA.right).toEqual({ dx: 1, dz: 0 })
    expect(stepYaw('up')).toBeCloseTo(0)
    expect(stepYaw('left')).toBeCloseTo(Math.PI / 2)
    expect(stepYaw('right')).toBeCloseTo(-Math.PI / 2)
    expect(Math.abs(stepYaw('down'))).toBeCloseTo(Math.PI)
    for (const d of ['up', 'down', 'left', 'right'] as const) expect(nearestDir(stepYaw(d) + 0.3 + 4 * Math.PI)).toBe(d)
    expect(dirBetween(c(1, 5), c(2, 5))).toBe('right')
    expect(dirBetween(c(1, 5), c(1, 4))).toBe('up')
    expect(dirBetween(c(1, 5), c(3, 5))).toBeNull()
  })
})

describe('stepTarget', () => {
  it('leads to the next floor cell', () => {
    expect(stepTarget(easy, c(0, 5), 'right')).toEqual({ cell: c(1, 5) })
    expect(stepTarget(easy, c(1, 5), 'up')).toEqual({ cell: c(1, 4) })
  })

  it('is blocked by a wall or the edge of the grid', () => {
    expect(stepTarget(easy, c(1, 5), 'down')).toEqual({ blocked: 'wall' })
    expect(stepTarget(easy, c(0, 5), 'up')).toEqual({ blocked: 'wall' })
    expect(stepTarget(easy, c(0, 5), 'left')).toEqual({ blocked: 'bounds' })
    expect(stepTarget(easy, c(6, 5), 'right')).toEqual({ blocked: 'bounds' })
  })
})

describe('snapCell', () => {
  it('keeps the floor cell under the car, wherever in it the car is', () => {
    const { x, z } = cellCenterXZ(c(1, 3))
    expect(snapCell(easy, x, z)).toEqual(c(1, 3))
    expect(snapCell(easy, x + MAZE_CELL * 0.45, z - MAZE_CELL * 0.45)).toEqual(c(1, 3))
  })

  it('from inside a wall: the nearest floor cell', () => {
    // In wall (2, 3), close to its east side: floor (3, 3) is nearest.
    const { x, z } = cellCenterXZ(c(2, 3))
    expect(snapCell(easy, x + MAZE_CELL * 0.4, z)).toEqual(c(3, 3))
  })

  it('from inside a wall: a cell on the way out wins over one about as near', () => {
    // Wall (4, 2) has floor all round but east: (4, 1) north is a dead end, (3, 2) and (4, 3) are on the way out.
    const onPath = new Set(solve(easy)!.map(cellKey))
    expect(onPath.has('4,1')).toBe(false)
    expect(onPath.has('3,2') && onPath.has('4,3')).toBe(true)
    const { x, z } = cellCenterXZ(c(4, 2))
    const snapped = snapCell(easy, x, z)!
    expect(onPath.has(cellKey(snapped))).toBe(true)
    // Clearly nearer to the dead end: that one.
    expect(snapCell(easy, x, z - MAZE_CELL * 0.45)).toEqual(c(4, 1))
  })

  it('startStepper glides to the cell centre, faces the nearest grid way, and reaches the cell at once', () => {
    const { x, z } = cellCenterXZ(c(1, 5))
    const r = startStepper(easy, x + 3, z - 2, -Math.PI / 2 + 0.4)!
    expect(r.events).toEqual([{ type: 'arrive', cell: c(1, 5) }])
    expect(r.stepper.motion?.kind).toBe('snap')
    const done = run(r.stepper, 0.3).stepper
    expect(done.motion).toBeNull()
    expect(stepperPose(done)).toMatchObject({ x, z, speed: 0 })
    expect(stepperPose(done).yaw).toBeCloseTo(stepYaw('right'))
  })
})

describe('stepping', () => {
  const start = placeStepper(c(0, 5), stepYaw('right'))

  it('one press moves exactly one cell, eased, then the car stands still', () => {
    const pressed = pressStep(start, easy, 'right')
    expect(pressed.events).toEqual([{ type: 'start', dir: 'right', to: c(1, 5) }])
    const half = run(pressed.stepper, STEP_SECONDS / 2)
    const mid = stepperPose(half.stepper)
    expect(mid.x).toBeGreaterThan(cellCenterXZ(c(0, 5)).x)
    expect(mid.x).toBeLessThan(cellCenterXZ(c(1, 5)).x)
    expect(mid.speed).toBeGreaterThan(0)
    const end = run(half.stepper, STEP_SECONDS)
    expect(end.events).toEqual([{ type: 'arrive', cell: c(1, 5) }])
    expect(end.stepper.cell).toEqual(c(1, 5))
    expect(end.stepper.motion).toBeNull()
    expect(stepperPose(end.stepper)).toMatchObject({ ...cellCenterXZ(c(1, 5)), speed: 0 })
  })

  it('turns to face the way it steps (the short way round)', () => {
    const at = placeStepper(c(1, 5), stepYaw('right'))
    const r = run(pressStep(at, easy, 'up').stepper, STEP_SECONDS + 0.05)
    expect(r.stepper.cell).toEqual(c(1, 4))
    expect(stepperPose(r.stepper).yaw).toBeCloseTo(stepYaw('up'))
    // From facing up (yaw 4 turns round), turning right is a quarter turn, not three.
    const turned = pressStep(placeStepper(c(1, 1), 8 * Math.PI), easy, 'right').stepper
    expect(turned.yaw - 8 * Math.PI).toBeCloseTo(-Math.PI / 2)
  })

  it('blocked: stays in its cell after a bump towards the wall and back', () => {
    const at = placeStepper(c(1, 5), stepYaw('right'))
    const r = pressStep(at, easy, 'down')
    expect(r.events).toEqual([{ type: 'bump', dir: 'down' }])
    const mid = stepperPose(run(r.stepper, BUMP_SECONDS / 2).stepper)
    expect(mid.z).toBeGreaterThan(cellCenterXZ(c(1, 5)).z) // nudged south, towards the wall
    const end = run(r.stepper, BUMP_SECONDS + 0.05)
    expect(end.events).toEqual([]) // no cell reached
    expect(end.stepper.cell).toEqual(c(1, 5))
    expect(stepperPose(end.stepper)).toMatchObject(cellCenterXZ(c(1, 5)))
  })

  it('a press during a step is queued (one at most, the latest wins)', () => {
    let s = pressStep(start, easy, 'right').stepper
    s = pressStep(s, easy, 'up').stepper // (1, 5) -> up is (1, 4)
    s = pressStep(s, easy, 'right').stepper // replaces it: (1, 5) -> right is (2, 5)
    expect(s.queued).toBe('right')
    const r = run(s, 2 * STEP_SECONDS + 0.05)
    expect(r.events.filter((e) => e.type === 'arrive')).toEqual([
      { type: 'arrive', cell: c(1, 5) },
      { type: 'arrive', cell: c(2, 5) },
    ])
    expect(r.stepper.motion).toBeNull()
  })

  it('holding a direction repeats steps until the way is blocked, quietly', () => {
    const r = run(pressStep(start, easy, 'right').stepper, 6 * STEP_SECONDS, 'right')
    // (0, 5) -> (1, 5) -> (2, 5) -> (3, 5), then a wall at (4, 5): no bump while only held.
    expect(r.stepper.cell).toEqual(c(3, 5))
    expect(r.events.filter((e) => e.type === 'bump')).toEqual([])
    expect(r.events.filter((e) => e.type === 'arrive')).toHaveLength(3)
  })

  it('holding glides on evenly: left-over time carries into the next step', () => {
    const r = run(pressStep(start, easy, 'right').stepper, 2.5 * STEP_SECONDS, 'right', 0.05)
    expect(r.stepper.cell).toEqual(c(2, 5))
    expect(r.stepper.motion?.t).toBeCloseTo(0.5 * STEP_SECONDS, 5)
  })
})

describe('reaching cells: coins and the exit', () => {
  it('a coin cell gives its coin once; the exit cell finishes', () => {
    const coin = c(3, 5)
    expect(easy.coins).toContain(cellKey(coin))
    const first = enterCell(easy, easy.coins, coin)
    expect(first).toMatchObject({ coin: true, exit: false })
    expect(first.coinsLeft).not.toContain(cellKey(coin))
    expect(enterCell(easy, first.coinsLeft, coin)).toMatchObject({ coin: false, coinsLeft: first.coinsLeft })
    expect(enterCell(easy, easy.coins, c(6, 5))).toMatchObject({ coin: false, exit: true })
    expect(enterCell(easy, easy.coins, c(1, 5))).toMatchObject({ coin: false, exit: false, coinsLeft: easy.coins })
  })

  it('stepping along the way out reaches every cell of it, the exit last', () => {
    const path = solve(easy)!
    let s = placeStepper(path[0], stepYaw('right'))
    const reached: Cell[] = []
    for (let i = 1; i < path.length; i++) {
      const r = pressStep(s, easy, dirBetween(path[i - 1], path[i])!)
      const done = run(r.stepper, STEP_SECONDS + 0.02)
      done.events.forEach((e) => e.type === 'arrive' && reached.push(e.cell))
      s = done.stepper
    }
    expect(reached).toEqual(path.slice(1))
    expect(s.cell).toEqual(easy.exit)
  })
})
