import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptySave } from '../core/serialize'
import type { Brick } from '../core/types'
import { useApp } from './useApp'
import { useEditor, workshopHasBricks } from './useEditor'
import { useGame } from './useGame'

const bricks = () => useGame.getState().data.workshop.bricks
const ed = () => useEditor.getState()

beforeEach(() => {
  useGame.setState({ data: createEmptySave() })
  ed().newModel('building', { w: 16, d: 16 })
  ed().setTool('place')
  ed().setPart('brick_2x4')
  ed().setColor(5)
  useEditor.setState({ rot: 0 })
})

describe('useEditor place/undo/redo', () => {
  it('places a brick with current part, color and rotation', () => {
    ed().place(1, 0, 2)
    expect(bricks()).toHaveLength(1)
    expect(bricks()[0]).toMatchObject({ p: 'brick_2x4', x: 1, y: 0, z: 2, r: 0, c: 5 })
    expect(ed().lastError).toBeNull()
  })

  it('place -> undo -> redo restores bricks', () => {
    ed().place(0, 0, 0)
    ed().place(4, 0, 0)
    const two = bricks()
    expect(ed().canUndo).toBe(true)
    ed().undo()
    expect(bricks()).toHaveLength(1)
    expect(ed().canRedo).toBe(true)
    ed().undo()
    expect(bricks()).toHaveLength(0)
    expect(ed().canUndo).toBe(false)
    ed().redo()
    ed().redo()
    expect(bricks()).toEqual(two)
    expect(ed().canRedo).toBe(false)
  })

  it('a new edit clears redo', () => {
    ed().place(0, 0, 0)
    ed().undo()
    ed().place(2, 0, 2)
    expect(ed().canRedo).toBe(false)
  })

  it('rotateCurrent cycles the rotation used by place', () => {
    ed().rotateCurrent()
    expect(ed().rot).toBe(1)
    ed().place(0, 0, 0)
    expect(bricks()[0].r).toBe(1)
  })
})

describe('useEditor errors', () => {
  it('collision sets lastError and leaves bricks unchanged; next success clears it', () => {
    ed().place(0, 0, 0)
    const before = bricks()
    ed().place(1, 0, 1)
    expect(ed().lastError).toBe('collision')
    expect(bricks()).toBe(before)
    expect(ed().canUndo).toBe(true)
    ed().undo()
    expect(bricks()).toHaveLength(0)
    ed().place(8, 0, 8)
    expect(ed().lastError).toBeNull()
  })

  it('failed place does not add a history entry', () => {
    ed().place(15, 0, 0) // 2 wide -> out of bounds
    expect(ed().lastError).toBe('out_of_bounds')
    expect(ed().canUndo).toBe(false)
  })

  it('errorSeq counts every rejected action, even a repeat of the same error', () => {
    const start = ed().errorSeq
    ed().place(0, 0, 0)
    expect(ed().errorSeq).toBe(start)
    ed().place(1, 0, 1)
    ed().place(1, 0, 1)
    expect(ed().lastError).toBe('collision')
    expect(ed().errorSeq).toBe(start + 2)
    ed().setTool('move')
    ed().tapBrick(bricks()[0].id)
    ed().place(15, 0, 0) // carried 2x4 -> out of bounds
    expect(ed().errorSeq).toBe(start + 3)
  })
})

describe('useEditor tapBrick', () => {
  let id: string
  beforeEach(() => {
    ed().place(0, 0, 0)
    id = bricks()[0].id
  })

  it('paint recolours with the current color and is undoable', () => {
    ed().setTool('paint')
    ed().setColor(9)
    ed().tapBrick(id)
    expect(bricks()[0].c).toBe(9)
    ed().undo()
    expect(bricks()[0].c).toBe(5)
  })

  it('painting a brick with its own colour changes nothing and leaves no undo step', () => {
    ed().setTool('paint')
    ed().setColor(5)
    const before = bricks()
    ed().tapBrick(id)
    expect(bricks()).toBe(before)
    expect(ed().lastError).toBeNull()
    ed().undo() // undoes the placement from beforeEach, not a phantom paint
    expect(bricks()).toHaveLength(0)
  })

  it('delete removes the brick and is undoable', () => {
    ed().setTool('delete')
    ed().tapBrick(id)
    expect(bricks()).toHaveLength(0)
    ed().undo()
    expect(bricks()).toHaveLength(1)
  })

  it('rotate turns the brick; an invalid rotation sets lastError', () => {
    ed().setTool('rotate')
    ed().tapBrick(id)
    expect(bricks()[0].r).toBe(1)
    ed().undo()
    expect(bricks()[0].r).toBe(0)
    useGame.getState().setWorkshop({ ...useGame.getState().data.workshop, bricks: [
      { id: 'edge', p: 'brick_2x4', x: 14, y: 0, z: 0, r: 0, c: 1 } as Brick,
    ] })
    ed().tapBrick('edge')
    expect(ed().lastError).toBe('out_of_bounds')
    expect(bricks()[0].r).toBe(0)
  })

  it('place tool ignores taps on bricks', () => {
    const before = bricks()
    ed().setTool('place')
    ed().tapBrick(id)
    expect(bricks()).toBe(before)
  })
})

describe('useEditor move tool', () => {
  it('picks up a brick, carries its attributes, and places it elsewhere', () => {
    ed().setPart('brick_1x2')
    ed().setColor(7)
    ed().place(0, 0, 0)
    const id = bricks()[0].id
    ed().setPart('brick_2x4')
    ed().setColor(1)
    ed().setTool('move')
    ed().tapBrick(id)
    expect(bricks()).toHaveLength(0)
    expect(ed().carried?.id).toBe(id)
    expect(ed().partId).toBe('brick_1x2')
    expect(ed().color).toBe(7)

    ed().place(6, 0, 6)
    expect(ed().carried).toBeNull()
    expect(bricks()).toHaveLength(1)
    expect(bricks()[0]).toMatchObject({ id, p: 'brick_1x2', c: 7, x: 6, z: 6 })

    // the whole move is one undo step
    ed().undo()
    expect(bricks()[0]).toMatchObject({ id, x: 0, z: 0 })
    expect(ed().canUndo).toBe(true)
  })

  it('a failed placement keeps the brick carried', () => {
    ed().place(0, 0, 0)
    ed().place(8, 0, 0)
    const id = bricks()[0].id
    ed().setTool('move')
    ed().tapBrick(id)
    ed().place(8, 0, 0)
    expect(ed().lastError).toBe('collision')
    expect(ed().carried?.id).toBe(id)
    expect(bricks()).toHaveLength(1)
  })

  it('undo while carrying cancels the pickup', () => {
    ed().place(0, 0, 0)
    const id = bricks()[0].id
    ed().setTool('move')
    ed().tapBrick(id)
    ed().undo()
    expect(ed().carried).toBeNull()
    expect(bricks()).toHaveLength(1)
    expect(bricks()[0].id).toBe(id)
  })
})

describe('useEditor carry cancel', () => {
  const pickUp = () => {
    ed().place(0, 0, 0)
    const id = bricks()[0].id
    ed().setTool('move')
    ed().tapBrick(id)
    return id
  }

  it('cancelCarry puts the brick back where it was and keeps history intact', () => {
    const id = pickUp()
    expect(bricks()).toHaveLength(0)
    ed().cancelCarry()
    expect(ed().carried).toBeNull()
    expect(bricks()).toHaveLength(1)
    expect(bricks()[0]).toMatchObject({ id, x: 0, z: 0 })
    ed().undo() // undoes the original placement, not the cancelled pickup
    expect(bricks()).toHaveLength(0)
  })

  it('cancelCarry without a carried brick does nothing', () => {
    ed().place(0, 0, 0)
    const before = bricks()
    ed().cancelCarry()
    expect(bricks()).toBe(before)
  })

  it('switching away from the move tool cancels the carry', () => {
    const id = pickUp()
    ed().setTool('paint')
    expect(ed().carried).toBeNull()
    expect(ed().tool).toBe('paint')
    expect(bricks().map((b) => b.id)).toEqual([id])
  })

  it('re-selecting the move tool while carrying keeps carrying', () => {
    const id = pickUp()
    ed().setTool('move')
    expect(ed().carried?.id).toBe(id)
    expect(bricks()).toHaveLength(0)
  })

  it('leaving the workshop cancels the carry', () => {
    useApp.setState({ mode: 'workshop' })
    const id = pickUp()
    useApp.setState({ mode: 'menu' })
    expect(ed().carried).toBeNull()
    expect(bricks().map((b) => b.id)).toEqual([id])
  })

  it('workshopHasBricks counts a carried brick', () => {
    expect(workshopHasBricks()).toBe(false)
    pickUp()
    expect(bricks()).toHaveLength(0)
    expect(workshopHasBricks()).toBe(true)
    ed().cancelCarry()
    expect(workshopHasBricks()).toBe(true)
    ed().undo()
    expect(workshopHasBricks()).toBe(false)
  })
})

describe('useEditor model loading', () => {
  it('newModel resets bricks, history and carried', () => {
    ed().place(0, 0, 0)
    ed().newModel('vehicle', { w: 8, d: 8 })
    expect(useGame.getState().data.workshop).toEqual({ kind: 'vehicle', baseplate: { w: 8, d: 8 }, bricks: [] })
    expect(ed().canUndo).toBe(false)
  })

  it('loadBricks sets workshop with editingBlueprintId', () => {
    const b: Brick = { id: 'x', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 2 }
    ed().loadBricks([b], 'prop', { w: 8, d: 8 }, 'bp1')
    expect(useGame.getState().data.workshop).toEqual({
      kind: 'prop', baseplate: { w: 8, d: 8 }, bricks: [b], editingBlueprintId: 'bp1',
    })
    expect(ed().canUndo).toBe(false)
  })
})
