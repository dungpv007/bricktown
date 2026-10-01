import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyMaze } from '../core/maze'
import { createEmptySave } from '../core/serialize'
import { useGame } from './useGame'

const game = () => useGame.getState()

beforeEach(() => {
  useGame.setState({ data: createEmptySave() })
})

describe('useGame mazes', () => {
  it('upsertMaze adds a new maze and replaces one with the same id in place', () => {
    const a = createEmptyMaze(7, 7, { id: 'a', name: 'A' })
    const b = createEmptyMaze(9, 9, { id: 'b', name: 'B' })
    game().upsertMaze(a)
    game().upsertMaze(b)
    game().upsertMaze({ ...a, name: 'A2' })
    expect(game().data.mazes.map((m) => [m.id, m.name])).toEqual([
      ['a', 'A2'],
      ['b', 'B'],
    ])
  })

  it('deleteMaze removes the maze, its best run and its challenge', () => {
    game().upsertMaze(createEmptyMaze(7, 7, { id: 'a' }))
    game().upsertMaze(createEmptyMaze(7, 7, { id: 'b' }))
    game().setMazeRecord('a', { timeMs: 1, stars: 3, coins: 0 })
    game().setMazeRecord('b', { timeMs: 2, stars: 2, coins: 1 })
    game().update((d) => ({ ...d, mazeChallenges: { a: { timeMs: 5 }, b: { timeMs: 6, from: 'An' } } }))
    game().deleteMaze('a')
    expect(game().data.mazes.map((m) => m.id)).toEqual(['b'])
    expect(game().data.mazeRecords).toEqual({ b: { timeMs: 2, stars: 2, coins: 1 } })
    expect(game().data.mazeChallenges).toEqual({ b: { timeMs: 6, from: 'An' } })
  })

  it('setMazeRecord stores the run under its key, replacing an older one', () => {
    game().setMazeRecord('tpl:easy', { timeMs: 5000, stars: 2, coins: 1 })
    game().setMazeRecord('tpl:easy', { timeMs: 4000, stars: 3, coins: 3 })
    expect(game().data.mazeRecords).toEqual({ 'tpl:easy': { timeMs: 4000, stars: 3, coins: 3 } })
  })
})
