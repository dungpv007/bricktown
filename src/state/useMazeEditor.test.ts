import { beforeEach, describe, expect, it } from 'vitest'
import { getMazeTemplate } from '../content/mazes'
import { isPlayable, playabilityError, type Cell } from '../core/maze'
import { createEmptySave } from '../core/serialize'
import { useApp } from './useApp'
import { currentMaze, useMazeEditor } from './useMazeEditor'
import { useGame } from './useGame'

const ed = () => useMazeEditor.getState()
const mazes = () => useGame.getState().data.mazes
const maze = () => {
  const m = currentMaze()
  if (!m) throw new Error('no maze open')
  return m
}
const c = (cx: number, cz: number): Cell => ({ cx, cz })
const walls = () => new Set(maze().walls)

beforeEach(() => {
  useApp.setState({ lang: 'vi' })
  useGame.setState({ data: createEmptySave() })
  useMazeEditor.setState({ errorSeq: 0 })
  ed().close()
})

describe('useMazeEditor: opening mazes', () => {
  it('starts with nothing open', () => {
    expect(ed().mazeId).toBeNull()
    expect(currentMaze()).toBeNull()
  })

  it('opens a ready-made maze without saving anything', () => {
    ed().openTemplate('easy')
    const tpl = getMazeTemplate('easy')!
    expect(ed().mazeId).toBe('tpl:easy')
    expect(maze()).toMatchObject({ id: 'tpl:easy', name: tpl.name.vi, templateId: 'easy', w: 7, h: 7 })
    expect(new Set(maze().walls)).toEqual(new Set(tpl.maze.walls))
    expect(mazes()).toEqual([])
    expect(ed().canUndo).toBe(false)
  })

  it('ignores an unknown template or maze id', () => {
    ed().openTemplate('nope')
    expect(currentMaze()).toBeNull()
    ed().openMaze('nope')
    expect(currentMaze()).toBeNull()
  })

  it('the first change to a ready-made maze makes it the kid’s own copy; undo keeps that copy', () => {
    ed().openTemplate('easy')
    const before = new Set(maze().walls)
    ed().setTool('wall')
    ed().tapCell(c(2, 1)) // floor in the easy template
    expect(mazes()).toHaveLength(1)
    const own = mazes()[0]
    expect(own.id).not.toBe('tpl:easy')
    expect(own).toMatchObject({ templateId: 'easy', name: `${getMazeTemplate('easy')!.name.vi} 2` })
    expect(ed().mazeId).toBe(own.id)
    expect(maze()).toBe(own)
    expect(walls().has('2,1')).toBe(true)
    expect(ed().canUndo).toBe(true)

    ed().undo()
    expect(ed().mazeId).toBe(own.id)
    expect(new Set(maze().walls)).toEqual(before)
    expect(mazes()).toHaveLength(1)
    expect(ed().canUndo).toBe(false)
  })

  it('copies of a ready-made maze are numbered, named in the language of the moment', () => {
    const copy = () => {
      ed().openTemplate('heart')
      ed().setTool('coin')
      ed().tapCell(c(7, 13)) // a floor cell of the heart's stem
      return maze().name
    }
    const heart = getMazeTemplate('heart')!.name
    expect(copy()).toBe(`${heart.vi} 2`)
    expect(copy()).toBe(`${heart.vi} 3`)
    useApp.setState({ lang: 'en' })
    expect(copy()).toBe(`${heart.en} 2`)
  })

  it('a name typed into a ready-made maze is the copy’s name', () => {
    ed().openTemplate('easy')
    ed().rename('Của em')
    expect(mazes()).toHaveLength(1)
    expect(maze().name).toBe('Của em')
  })

  it('a change that changes nothing keeps the ready-made maze untouched and is refused', () => {
    ed().openTemplate('easy')
    ed().setTool('erase')
    ed().tapCell(c(0, 0)) // the outer ring cannot be erased
    expect(mazes()).toEqual([])
    expect(ed().mazeId).toBe('tpl:easy')
    expect(ed().canUndo).toBe(false)
    expect(ed().errorSeq).toBe(1)
  })

  it('newMaze creates an empty, numbered maze of the chosen size that is not playable yet', () => {
    ed().newMaze(9)
    expect(mazes()).toHaveLength(1)
    expect(maze()).toMatchObject({ w: 9, h: 9, name: 'Mê cung 1', entry: null, exit: null })
    expect(playabilityError(maze())).toBe('no_entry')
    ed().close()
    ed().newMaze(7)
    expect(maze().name).toBe('Mê cung 2')
  })

  it('newGenerated creates a playable maze of the difficulty’s size, opened and saved', () => {
    ed().newGenerated(3, 42)
    expect(mazes()).toHaveLength(1)
    expect(maze()).toBe(mazes()[0])
    expect(maze()).toMatchObject({ w: 15, h: 15 })
    expect(isPlayable(maze())).toBe(true)
    expect(maze().coins.length).toBeGreaterThan(0)
  })

  it('opening another maze forgets the undo history; close goes back to the picker', () => {
    ed().newMaze(7)
    ed().setTool('wall')
    ed().tapCell(c(3, 3))
    expect(ed().canUndo).toBe(true)
    const id = ed().mazeId!
    ed().close()
    expect(currentMaze()).toBeNull()
    ed().openMaze(id)
    expect(ed().canUndo).toBe(false)
    expect(walls().has('3,3')).toBe(true)
  })

  it('stamps updatedAt on every saved change', () => {
    ed().newMaze(7)
    useGame.getState().upsertMaze({ ...maze(), updatedAt: 1 })
    ed().setTool('wall')
    ed().tapCell(c(3, 3))
    expect(maze().updatedAt).toBeGreaterThan(1)
  })
})

describe('useMazeEditor: walls', () => {
  beforeEach(() => {
    ed().newMaze(7)
    ed().setTool('wall')
  })

  it('a drag paints every cell along the stroke in one undo step, shown as a preview until release', () => {
    ed().strokeStart(c(1, 1))
    ed().strokeTo(c(4, 1))
    expect(new Set(ed().preview!.walls)).toEqual(new Set([...maze().walls, '1,1', '2,1', '3,1', '4,1']))
    expect(walls().has('2,1')).toBe(false) // not saved yet
    ed().strokeEnd()
    expect(ed().preview).toBeNull()
    for (const k of ['1,1', '2,1', '3,1', '4,1']) expect(walls().has(k)).toBe(true)
    ed().undo()
    for (const k of ['1,1', '2,1', '3,1', '4,1']) expect(walls().has(k)).toBe(false)
    expect(ed().canUndo).toBe(false)
  })

  it('a fast diagonal drag leaves no gaps', () => {
    ed().strokeStart(c(1, 1))
    ed().strokeTo(c(4, 4))
    ed().strokeEnd()
    const added = maze().walls.filter((k) => !k.startsWith('0,') && !k.endsWith(',0') && !k.startsWith('6,') && !k.endsWith(',6'))
    expect(added).toHaveLength(7)
  })

  it('cells dragged past the edge stay on the grid', () => {
    ed().strokeStart(c(3, 3))
    ed().strokeTo(c(400, 3))
    ed().strokeEnd()
    expect(maze().walls.every((k) => k.split(',').map(Number).every((v) => v >= 0 && v < 7))).toBe(true)
    expect(walls().has('5,3')).toBe(true)
  })

  it('a tap on an inside wall with the wall tool removes it; a drag starting on a wall extends it', () => {
    ed().tapCell(c(3, 3))
    expect(walls().has('3,3')).toBe(true)
    ed().tapCell(c(3, 3))
    expect(walls().has('3,3')).toBe(false)
    ed().tapCell(c(3, 3))
    ed().strokeStart(c(3, 3))
    ed().strokeTo(c(3, 5))
    ed().strokeEnd()
    for (const k of ['3,3', '3,4', '3,5']) expect(walls().has(k)).toBe(true)
  })

  it('the eraser removes walls along a stroke but never opens the outer ring', () => {
    ed().strokeStart(c(1, 2))
    ed().strokeTo(c(5, 2))
    ed().strokeEnd()
    ed().setTool('erase')
    ed().strokeStart(c(0, 2))
    ed().strokeTo(c(3, 2))
    ed().strokeEnd()
    expect(walls().has('0,2')).toBe(true)
    for (const k of ['1,2', '2,2', '3,2']) expect(walls().has(k)).toBe(false)
    expect(walls().has('4,2')).toBe(true)
  })

  it('a cancelled stroke changes nothing', () => {
    ed().strokeStart(c(1, 1))
    ed().strokeTo(c(3, 1))
    ed().strokeCancel()
    expect(ed().preview).toBeNull()
    expect(walls().has('2,1')).toBe(false)
    expect(ed().canUndo).toBe(false)
  })

  it('stroke calls do nothing with tools that do not paint', () => {
    ed().setTool('coin')
    ed().strokeStart(c(1, 1))
    ed().strokeTo(c(3, 1))
    ed().strokeEnd()
    expect(walls().has('2,1')).toBe(false)
    expect(ed().preview).toBeNull()
  })
})

describe('useMazeEditor: doors and coins', () => {
  beforeEach(() => ed().newMaze(7))

  it('sets the entry and the exit on the edge, making the maze playable', () => {
    ed().setTool('entry')
    ed().tapCell(c(0, 3))
    ed().setTool('exit')
    ed().tapCell(c(6, 3))
    expect(maze().entry).toEqual(c(0, 3))
    expect(maze().exit).toEqual(c(6, 3))
    expect(isPlayable(maze())).toBe(true)
    ed().undo()
    expect(maze().exit).toBeNull()
  })

  it('refuses doors on corners, inside the maze or on the other door, saying why', () => {
    ed().setTool('entry')
    ed().tapCell(c(0, 0))
    expect(ed().lastError).toBe('corner')
    ed().tapCell(c(3, 3))
    expect(ed().lastError).toBe('not_border')
    ed().tapCell(c(0, 3))
    expect(ed().lastError).toBeNull()
    ed().setTool('exit')
    ed().tapCell(c(0, 3))
    expect(ed().lastError).toBe('same_cell')
    expect(ed().errorSeq).toBe(3)
  })

  it('tapping the entry again with the entry tool changes nothing and is not an error', () => {
    ed().setTool('entry')
    ed().tapCell(c(0, 3))
    const seq = ed().errorSeq
    ed().tapCell(c(0, 3))
    expect(ed().errorSeq).toBe(seq)
  })

  it('toggles coins on floor cells; not on walls', () => {
    ed().setTool('coin')
    ed().tapCell(c(2, 2))
    expect(maze().coins).toEqual(['2,2'])
    ed().tapCell(c(2, 2))
    expect(maze().coins).toEqual([])
    ed().tapCell(c(0, 2))
    expect(maze().coins).toEqual([])
    expect(ed().lastError).toBe('nothing')
  })

  it('ignores taps outside the grid', () => {
    ed().setTool('coin')
    ed().tapCell(c(-3, 2))
    ed().tapCell(c(2, 40))
    expect(ed().errorSeq).toBe(0)
    expect(ed().canUndo).toBe(false)
  })
})

describe('useMazeEditor: whole-maze changes', () => {
  it('🎲 replaces the layout with a new playable maze, keeping name and colour; undo brings the old one back', () => {
    ed().openTemplate('heart')
    ed().setWallColor(3)
    const { id, name } = maze()
    const heartWalls = new Set(maze().walls)
    ed().generate(2, 7)
    expect(maze()).toMatchObject({ id, name, wallColor: 3, w: 11, h: 11 })
    expect(maze().templateId).toBeUndefined()
    expect(isPlayable(maze())).toBe(true)
    ed().undo()
    expect(new Set(maze().walls)).toEqual(heartWalls)
  })

  it('resizes the maze, undoably', () => {
    ed().newMaze(7)
    ed().resize(11)
    expect(maze()).toMatchObject({ w: 11, h: 11 })
    ed().undo()
    expect(maze()).toMatchObject({ w: 7, h: 7 })
    ed().resize(7) // same size: nothing to undo
    expect(ed().canUndo).toBe(false)
  })

  it('changes the wall colour and the name', () => {
    ed().newMaze(7)
    ed().setWallColor(5)
    expect(maze().wallColor).toBe(5)
    ed().rename('  Lâu đài  ')
    expect(maze().name).toBe('Lâu đài')
    ed().rename('   ')
    expect(maze().name).toBe('Lâu đài') // an empty name is not a name
  })

  it('editing walls, doors, coins or the size forgets the maze’s records; naming and colours keep them', () => {
    ed().newMaze(7)
    const id = maze().id
    const seed = () => {
      useGame.getState().setMazeRecord(id, { timeMs: 1000, stars: 3, coins: 0 })
      useGame.getState().update((d) => ({ ...d, mazeChallenges: { [id]: { timeMs: 2000 } } }))
    }
    const kept = () => id in useGame.getState().data.mazeRecords && id in useGame.getState().data.mazeChallenges
    const cleared = () => !(id in useGame.getState().data.mazeRecords) && !(id in useGame.getState().data.mazeChallenges)
    seed()
    ed().rename('Lâu đài')
    ed().setWallColor(5)
    expect(kept()).toBe(true)
    ed().undo() // undoing a colour is not a structural change either
    expect(kept()).toBe(true)

    const edits: Array<() => void> = [
      () => { ed().setTool('wall'); ed().tapCell(c(3, 3)) },
      () => { ed().setTool('entry'); ed().tapCell(c(0, 1)) },
      () => { ed().setTool('coin'); ed().tapCell(c(2, 2)) },
      () => ed().resize(9),
    ]
    for (const change of edits) {
      seed()
      change()
      expect(cleared()).toBe(true)
    }
  })

  it('undoing a structural edit brings back the best run and the friend’s challenge it forgot', () => {
    ed().newMaze(7)
    const id = maze().id
    const record = { timeMs: 1000, stars: 3 as const, coins: 0 }
    const challenge = { timeMs: 2000, from: 'An' }
    useGame.getState().setMazeRecord(id, record)
    useGame.getState().update((d) => ({ ...d, mazeChallenges: { [id]: challenge } }))
    ed().rename('Lâu đài') // not structural: its undo step keeps the runs as they are
    ed().setTool('wall')
    ed().tapCell(c(3, 3)) // a stray tap
    expect(useGame.getState().data.mazeRecords[id]).toBeUndefined()
    expect(useGame.getState().data.mazeChallenges[id]).toBeUndefined()
    ed().undo()
    expect(walls().has('3,3')).toBe(false)
    expect(useGame.getState().data.mazeRecords[id]).toEqual(record)
    expect(useGame.getState().data.mazeChallenges[id]).toEqual(challenge)
    // A newer record set after the rename survives undoing the rename (same layout).
    const better = { timeMs: 900, stars: 3 as const, coins: 0 }
    useGame.getState().setMazeRecord(id, better)
    ed().undo()
    expect(maze().name).not.toBe('Lâu đài')
    expect(useGame.getState().data.mazeRecords[id]).toEqual(better)
  })

  it('ready-made mazes and a friend’s maze open with the move tool; the kid’s own and new ones with the wall tool', () => {
    ed().openTemplate('easy')
    expect(ed().tool).toBe('move')
    ed().tapCell(c(2, 1)) // a tap while looking around changes nothing
    expect(mazes()).toEqual([])
    ed().newMaze(7)
    expect(ed().tool).toBe('wall')
    const own = maze().id
    ed().newGenerated(1, 1)
    const friend = maze().id
    useGame.getState().update((d) => ({ ...d, mazeChallenges: { [friend]: { timeMs: 5000 } } }))
    ed().openMaze(friend)
    expect(ed().tool).toBe('move')
    ed().openMaze(own)
    expect(ed().tool).toBe('wall')
  })

  it('typing a name saves each keystroke but undoes as one step', () => {
    ed().newMaze(7)
    const original = maze().name
    ed().setTool('wall')
    ed().tapCell(c(3, 3))
    for (const typed of ['L', 'Lâ', 'Lâu']) ed().rename(typed)
    expect(maze().name).toBe('Lâu')
    ed().undo()
    expect(maze().name).toBe(original)
    expect(walls().has('3,3')).toBe(true)
    ed().undo()
    expect(walls().has('3,3')).toBe(false)
  })
})
