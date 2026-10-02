import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_FIG, figPreset } from '../core/figures'
import { createEmptySave } from '../core/serialize'
import type { Brick } from '../core/types'
import { useEditor, workshopHasBricks } from './useEditor'
import { useGame } from './useGame'

const bricks = () => useGame.getState().data.workshop.bricks
const ed = () => useEditor.getState()

beforeEach(() => {
  useGame.setState({ data: createEmptySave() })
  ed().newModel('building', { w: 16, d: 16 })
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
    ed().moveBrick(bricks()[0].id, { x: 15, y: 0, z: 0 }) // 2x4 -> out of bounds
    expect(ed().errorSeq).toBe(start + 3)
  })
})

describe('useEditor selection', () => {
  let id: string
  beforeEach(() => {
    ed().place(0, 0, 0)
    id = bricks()[0].id
    ed().deselect()
  })

  it('select / deselect; selecting a brick that does not exist does nothing', () => {
    expect(ed().selectedId).toBeNull()
    ed().select(id)
    expect(ed().selectedId).toBe(id)
    ed().select(id) // tapping the selected brick again keeps it selected
    expect(ed().selectedId).toBe(id)
    ed().select('nope')
    expect(ed().selectedId).toBe(id)
    ed().deselect()
    expect(ed().selectedId).toBeNull()
  })

  it('placing a brick selects it', () => {
    ed().place(8, 0, 8)
    expect(ed().selectedId).toBe(bricks()[1].id)
    ed().place(8, 0, 8) // rejected: the selection stays
    expect(ed().selectedId).toBe(bricks()[1].id)
  })

  it('actions without a selection do nothing', () => {
    const before = bricks()
    ed().rotateSelected()
    ed().deleteSelected()
    ed().duplicateSelected()
    ed().paintSelected(9)
    expect(bricks()).toBe(before)
    expect(ed().lastError).toBeNull()
  })

  it('rotateSelected turns the brick (undoable); a blocked turn reports an error', () => {
    ed().select(id)
    ed().rotateSelected()
    expect(bricks()[0].r).toBe(1)
    ed().undo()
    expect(bricks()[0].r).toBe(0)
    expect(ed().selectedId).toBe(id)
    useGame.getState().setWorkshop({ ...useGame.getState().data.workshop, bricks: [
      { id: 'edge', p: 'brick_2x4', x: 14, y: 0, z: 0, r: 0, c: 1 } as Brick,
    ] })
    ed().select('edge')
    const seq = ed().errorSeq
    ed().rotateSelected()
    expect(ed().lastError).toBe('out_of_bounds')
    expect(ed().errorSeq).toBe(seq + 1)
    expect(bricks()[0].r).toBe(0)
    expect(ed().selectedId).toBe('edge')
  })

  it('stepSelected moves one stud per call as one undo step each; the plate edge rejects with an error', () => {
    ed().select(id)
    ed().stepSelected(1, 0)
    ed().stepSelected(1, 0)
    expect(bricks()[0]).toMatchObject({ x: 2, y: 0, z: 0 })
    expect(ed().selectedId).toBe(id)
    ed().undo()
    expect(bricks()[0]).toMatchObject({ x: 1, z: 0 })
    ed().undo()
    expect(bricks()[0]).toMatchObject({ x: 0, z: 0 })
    const before = bricks()
    const seq = ed().errorSeq
    ed().stepSelected(-1, 0)
    expect(ed().lastError).toBe('out_of_bounds')
    expect(ed().errorSeq).toBe(seq + 1)
    expect(bricks()).toBe(before)
  })

  it('stepSelected climbs onto a neighbour and steps down again; without a selection it does nothing', () => {
    ed().place(4, 0, 0)
    const before = bricks()
    ed().deselect()
    ed().stepSelected(1, 0)
    expect(bricks()).toBe(before)
    ed().select(id) // the 2x4 at (0, 0, 0) spans x 0..2
    ed().stepSelected(1, 0)
    ed().stepSelected(1, 0)
    expect(bricks().find((b) => b.id === id)).toMatchObject({ x: 2, y: 0 })
    ed().stepSelected(1, 0) // x 3..5 now overlaps the 2x4 at x 4..6: on top of it
    expect(bricks().find((b) => b.id === id)).toMatchObject({ x: 3, y: 3 })
    ed().stepSelected(0, 4) // clear of it, over bare plate
    expect(bricks().find((b) => b.id === id)).toMatchObject({ x: 3, y: 0, z: 4 })
  })

  it('deleteSelected removes the brick and clears the selection; undo brings the brick back', () => {
    ed().select(id)
    ed().deleteSelected()
    expect(bricks()).toHaveLength(0)
    expect(ed().selectedId).toBeNull()
    ed().undo()
    expect(bricks()).toHaveLength(1)
  })

  it('paintSelected recolours the selected brick (undoable) and makes it the colour for new bricks', () => {
    ed().select(id)
    ed().paintSelected(9)
    expect(bricks()[0].c).toBe(9)
    expect(ed().color).toBe(9)
    ed().undo()
    expect(bricks()[0].c).toBe(5)
  })

  it('hintColors asks the colour column to draw attention to itself', () => {
    const seq = ed().colorHintSeq
    ed().hintColors()
    expect(ed().colorHintSeq).toBe(seq + 1)
  })

  it('painting a brick with its own colour changes nothing and leaves no undo step', () => {
    ed().select(id)
    const before = bricks()
    ed().paintSelected(5)
    expect(bricks()).toBe(before)
    ed().undo() // undoes the placement from beforeEach, not a phantom paint
    expect(bricks()).toHaveLength(0)
  })

  it('duplicateSelected copies the brick on top first, then beside it, and selects the copy', () => {
    ed().select(id)
    ed().duplicateSelected()
    expect(bricks()).toHaveLength(2)
    const copy = bricks()[1]
    expect(copy).toMatchObject({ p: 'brick_2x4', x: 0, y: 3, z: 0, r: 0, c: 5 })
    expect(copy.id).not.toBe(id)
    expect(ed().selectedId).toBe(copy.id)
    ed().select(id)
    ed().duplicateSelected() // on top is taken now: +X
    expect(bricks()[2]).toMatchObject({ x: 2, y: 0, z: 0 })
    ed().undo()
    ed().undo()
    expect(bricks()).toHaveLength(1)
  })

  it('duplicating a figure keeps its look', () => {
    ed().setPart('minifig')
    ed().setFig(figPreset('robber'))
    ed().place(8, 0, 8)
    ed().duplicateSelected()
    expect(bricks()[2]).toMatchObject({ p: 'minifig', fig: figPreset('robber') })
    ed().setFig(DEFAULT_FIG) // the figures tests below start from the default look
  })

  it('duplicateSelected reports an error when no spot fits', () => {
    useGame.getState().setWorkshop({ kind: 'prop', baseplate: { w: 2, d: 4 }, bricks: [
      { id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 1 } as Brick,
      { id: 'b', p: 'brick_2x4', x: 0, y: 3, z: 0, r: 0, c: 1 } as Brick,
    ] })
    ed().select('a')
    const seq = ed().errorSeq
    ed().duplicateSelected()
    expect(bricks()).toHaveLength(2)
    expect(ed().errorSeq).toBe(seq + 1)
    expect(ed().selectedId).toBe('a')
  })

  it('moveBrick moves a brick as one undo step and selects it', () => {
    ed().moveBrick(id, { x: 6, y: 0, z: 6 })
    expect(bricks()[0]).toMatchObject({ id, x: 6, y: 0, z: 6 })
    expect(ed().selectedId).toBe(id)
    ed().undo()
    expect(bricks()[0]).toMatchObject({ id, x: 0, y: 0, z: 0 })
    ed().undo()
    expect(bricks()).toHaveLength(0)
  })

  it('moveBrick to an invalid spot keeps the brick where it was and reports an error', () => {
    ed().place(8, 0, 0)
    const seq = ed().errorSeq
    ed().moveBrick(id, { x: 8, y: 0, z: 1 })
    expect(ed().lastError).toBe('collision')
    expect(ed().errorSeq).toBe(seq + 1)
    expect(bricks()[0]).toMatchObject({ id, x: 0, z: 0 })
  })

  it('moveBrick to where the brick already is records nothing', () => {
    ed().moveBrick(id, { x: 0, y: 0, z: 0 })
    ed().undo()
    expect(bricks()).toHaveLength(0)
  })

  it('the selection clears when its brick disappears through undo, redo or loading', () => {
    ed().place(8, 0, 8)
    expect(ed().selectedId).toBe(bricks()[1].id)
    ed().undo() // the selected brick is gone
    expect(ed().selectedId).toBeNull()
    ed().redo()
    ed().select(bricks()[1].id)
    ed().select(id)
    ed().undo() // brick 2 goes, the selected brick 1 stays
    expect(ed().selectedId).toBe(id)

    ed().newModel('building', { w: 16, d: 16 })
    expect(ed().selectedId).toBeNull()
    ed().place(0, 0, 0)
    ed().loadBricks([], 'prop', { w: 8, d: 8 })
    expect(ed().selectedId).toBeNull()
  })

  it('workshopHasBricks follows the model', () => {
    expect(workshopHasBricks()).toBe(true)
    ed().select(id)
    ed().deleteSelected()
    expect(workshopHasBricks()).toBe(false)
  })
})

describe('useEditor model loading', () => {
  it('newModel resets bricks and history', () => {
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

describe('useEditor resizePlate', () => {
  const plate = () => useGame.getState().data.workshop.baseplate

  it('growing W widens the plate and shifts bricks +8 on X; undo/redo restore both', () => {
    ed().place(0, 0, 0)
    ed().resizePlate('W', 'grow')
    expect(plate()).toEqual({ w: 24, d: 16 })
    expect(bricks()[0]).toMatchObject({ x: 8, z: 0 })
    expect(ed().lastError).toBeNull()
    ed().undo()
    expect(plate()).toEqual({ w: 16, d: 16 })
    expect(bricks()[0]).toMatchObject({ x: 0, z: 0 })
    ed().redo()
    expect(plate()).toEqual({ w: 24, d: 16 })
    expect(bricks()[0]).toMatchObject({ x: 8, z: 0 })
  })

  it('growing E or S leaves bricks where they are', () => {
    ed().place(1, 0, 2)
    const before = bricks()
    ed().resizePlate('E', 'grow')
    ed().resizePlate('S', 'grow')
    expect(plate()).toEqual({ w: 24, d: 24 })
    expect(bricks()).toEqual(before)
  })

  it('shrinking N shifts bricks -8 on Z and is undoable', () => {
    useGame.getState().setWorkshop({ ...useGame.getState().data.workshop, baseplate: { w: 16, d: 24 } })
    ed().place(0, 0, 10)
    ed().resizePlate('N', 'shrink')
    expect(plate()).toEqual({ w: 16, d: 16 })
    expect(bricks()[0]).toMatchObject({ x: 0, z: 2 })
    ed().undo()
    expect(plate()).toEqual({ w: 16, d: 24 })
    expect(bricks()[0]).toMatchObject({ x: 0, z: 10 })
  })

  it('undo steps through edits made before and after a resize', () => {
    ed().place(0, 0, 0)
    ed().resizePlate('W', 'grow')
    ed().place(20, 0, 0) // only fits on the wider plate
    expect(bricks()).toHaveLength(2)
    ed().undo()
    expect(bricks()).toHaveLength(1)
    expect(plate()).toEqual({ w: 24, d: 16 })
    ed().undo()
    expect(plate()).toEqual({ w: 16, d: 16 })
    expect(bricks()[0]).toMatchObject({ x: 0 })
    ed().undo()
    expect(bricks()).toHaveLength(0)
    expect(ed().canUndo).toBe(false)
  })

  it('a rejected resize reports the error and adds no undo step', () => {
    const start = ed().errorSeq
    ed().resizePlate('W', 'shrink') // empty strip: 16 -> 8 is fine
    expect(plate()).toEqual({ w: 8, d: 16 })
    ed().resizePlate('W', 'shrink')
    expect(ed().lastError).toBe('min')
    expect(ed().errorSeq).toBe(start + 1)
    ed().undo()
    expect(plate()).toEqual({ w: 16, d: 16 })
    expect(ed().canUndo).toBe(false)

    ed().place(0, 0, 0)
    ed().resizePlate('W', 'shrink')
    expect(ed().lastError).toBe('not_empty')
    expect(plate()).toEqual({ w: 16, d: 16 })
    expect(bricks()[0]).toMatchObject({ x: 0 })

    for (let i = 0; i < 4; i++) ed().resizePlate('E', 'grow')
    expect(plate()).toEqual({ w: 48, d: 16 })
    ed().resizePlate('W', 'grow')
    expect(ed().lastError).toBe('max')
    expect(ed().errorSeq).toBe(start + 3)
  })

  it('a successful resize clears redo', () => {
    ed().place(0, 0, 0)
    ed().undo()
    ed().resizePlate('E', 'grow')
    expect(ed().canRedo).toBe(false)
  })

  it('reports the view shift so the camera can follow the bricks', () => {
    const seq = ed().viewShift.seq
    ed().resizePlate('E', 'grow') // bricks do not move: no shift
    expect(ed().viewShift.seq).toBe(seq)
    ed().resizePlate('W', 'grow')
    expect(ed().viewShift).toEqual({ seq: seq + 1, dx: 8, dz: 0 })
    ed().resizePlate('N', 'grow')
    expect(ed().viewShift).toEqual({ seq: seq + 2, dx: 0, dz: 8 })
    ed().undo()
    expect(ed().viewShift).toEqual({ seq: seq + 3, dx: 0, dz: -8 })
    ed().redo()
    expect(ed().viewShift).toEqual({ seq: seq + 4, dx: 0, dz: 8 })
    ed().undo()
    ed().undo()
    expect(ed().viewShift).toEqual({ seq: seq + 6, dx: -8, dz: 0 })
    ed().undo() // the E grow: no shift
    expect(ed().viewShift.seq).toBe(seq + 6)
  })

  it('newModel and loadBricks ask the camera to re-frame', () => {
    const frame = ed().frameSeq
    ed().newModel('building', { w: 16, d: 16 })
    expect(ed().frameSeq).toBe(frame + 1)
    ed().loadBricks([], 'prop', { w: 8, d: 8 })
    expect(ed().frameSeq).toBe(frame + 2)
  })
})

describe('useEditor setPlateColor', () => {
  const plate = () => useGame.getState().data.workshop.baseplate

  it('colours the plate as one undoable step, keeping its size and bricks', () => {
    ed().place(0, 0, 0)
    const placed = bricks()
    ed().setPlateColor(24)
    expect(plate()).toEqual({ w: 16, d: 16, c: 24 })
    expect(bricks()).toEqual(placed)
    expect(ed().canUndo).toBe(true)
    ed().undo()
    expect(plate()).toEqual({ w: 16, d: 16 })
    expect(bricks()).toEqual(placed)
    ed().redo()
    expect(plate()).toEqual({ w: 16, d: 16, c: 24 })
  })

  it('picking the colour the plate already shows records nothing', () => {
    ed().setPlateColor(5) // a building plate is green by default
    expect(ed().canUndo).toBe(false)
    expect(plate()).toEqual({ w: 16, d: 16 })
    ed().setPlateColor(3)
    ed().setPlateColor(3)
    ed().undo()
    expect(plate()).toEqual({ w: 16, d: 16 })
    expect(ed().canUndo).toBe(false)
  })

  it('survives resizing and is undone in order with it', () => {
    ed().setPlateColor(10)
    ed().resizePlate('E', 'grow')
    expect(plate()).toEqual({ w: 24, d: 16, c: 10 })
    ed().undo()
    expect(plate()).toEqual({ w: 16, d: 16, c: 10 })
    ed().undo()
    expect(plate()).toEqual({ w: 16, d: 16 })
  })
})

describe('useEditor figures', () => {
  const placeFig = (preset: string, x = 2, z = 2) => {
    ed().setPart('minifig')
    ed().setFig(figPreset(preset))
    ed().place(x, 0, z)
    return bricks()[bricks().length - 1]
  }

  it('starts with the default figure and places the current figure style', () => {
    expect(ed().fig).toEqual(DEFAULT_FIG)
    const f = placeFig('chef')
    expect(f).toMatchObject({ p: 'minifig', x: 2, y: 0, z: 2, c: figPreset('chef').torso, fig: figPreset('chef') })
    // Other parts carry no style.
    ed().setPart('brick_1x1')
    ed().place(8, 0, 8)
    expect(bricks()[1].fig).toBeUndefined()
  })

  it('restyles a placed figure as one undoable step', () => {
    const f = placeFig('chef')
    ed().restyleFigure(f.id, figPreset('robber'))
    expect(bricks()[0]).toMatchObject({ c: figPreset('robber').torso, fig: figPreset('robber') })
    ed().undo()
    expect(bricks()[0].fig).toEqual(figPreset('chef'))
    ed().redo()
    expect(bricks()[0].fig).toEqual(figPreset('robber'))
  })

  it('restyling with the same look records nothing', () => {
    const f = placeFig('chef')
    const before = ed().canUndo
    ed().undo()
    ed().redo()
    ed().restyleFigure(f.id, { ...figPreset('chef'), arms: figPreset('chef').torso })
    expect(ed().canRedo).toBe(false)
    expect(ed().canUndo).toBe(before)
    expect(bricks()[0].fig).toEqual(figPreset('chef'))
  })

  it('painting a selected figure recolours its torso (undoable) and opens the figure editor for it', () => {
    const f = placeFig('chef')
    ed().select(f.id)
    ed().paintSelected(2)
    expect(bricks()[0].fig).toEqual({ ...figPreset('chef'), torso: 2 })
    expect(ed().figEditor).toEqual({ brickId: f.id })
    ed().closeFigEditor()
    expect(ed().figEditor).toBeNull()
    ed().undo()
    expect(bricks()[0].fig).toEqual(figPreset('chef'))
    // Its torso already has the colour: nothing to paint, the editor still opens.
    ed().paintSelected(figPreset('chef').torso)
    expect(ed().canRedo).toBe(true)
    expect(ed().figEditor).toEqual({ brickId: f.id })
    // Trans red on a red torso: the nearest solid is the same red, so nothing to paint either.
    ed().paintSelected(2)
    ed().paintSelected(5)
    ed().undo()
    ed().paintSelected(16)
    expect(bricks()[0].fig?.torso).toBe(2)
    expect(ed().canRedo).toBe(true)
  })

  it('opens the figure editor for the figure about to be placed', () => {
    ed().openFigEditor()
    expect(ed().figEditor).toEqual({ brickId: null })
  })

  it('moving a figure keeps its style', () => {
    const f = placeFig('robber')
    ed().setFig(figPreset('chef'))
    ed().moveBrick(f.id, { x: 6, y: 0, z: 6 })
    expect(bricks()[0]).toMatchObject({ x: 6, z: 6, fig: figPreset('robber') })
  })

  it('a new model or a loaded one closes the figure editor', () => {
    const f = placeFig('robber')
    ed().select(f.id)
    ed().paintSelected(2)
    ed().newModel('building', { w: 16, d: 16 })
    expect(ed().figEditor).toBeNull()
  })
})
