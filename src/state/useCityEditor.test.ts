import { beforeEach, describe, expect, it } from 'vitest'
import { CELL } from '../core/city'
import { createEmptySave } from '../core/serialize'
import { useCityEditor } from './useCityEditor'
import { useGame } from './useGame'

const ed = () => useCityEditor.getState()
const city = () => useGame.getState().data.city
/** World point at the centre of cell (cx, cz). */
const at = (cx: number, cz: number): [number, number] => [(cx + 0.5) * CELL, (cz + 0.5) * CELL]

beforeEach(() => {
  useGame.setState({ data: createEmptySave() })
  useCityEditor.setState({ selectedSource: null, errorSeq: 0 })
  ed().reset()
})

describe('useCityEditor roads', () => {
  it('paints an L-shaped road and undoes it in one step', () => {
    ed().setRoadMode(true)
    ed().paintRoad({ cx: 1, cz: 1 }, { cx: 3, cz: 2 })
    expect(new Set(city().roads)).toEqual(new Set(['1,1', '2,1', '3,1', '3,2']))
    expect(ed().canUndo).toBe(true)
    ed().undo()
    expect(city().roads).toEqual([])
    expect(ed().canUndo).toBe(false)
  })

  it('clamps drags that leave the grid and ignores repaints of existing roads', () => {
    ed().paintRoad({ cx: 46, cz: 0 }, { cx: 60, cz: 0 })
    expect(new Set(city().roads)).toEqual(new Set(['46,0', '47,0']))
    const seq = ed().errorSeq
    ed().paintRoad({ cx: 46, cz: 0 }, { cx: 47, cz: 0 })
    expect(city().roads).toHaveLength(2)
    expect(ed().errorSeq).toBe(seq + 1)
  })

  it('erases the dragged-over road cells in one undo step; nothing to erase is rejected', () => {
    ed().paintRoad({ cx: 1, cz: 1 }, { cx: 4, cz: 1 })
    ed().eraseRoads(['2,1', '3,1', '9,9'])
    expect(new Set(city().roads)).toEqual(new Set(['1,1', '4,1']))
    const seq = ed().errorSeq
    ed().eraseRoads(['9,9'])
    expect(ed().errorSeq).toBe(seq + 1)
    ed().undo()
    expect(city().roads).toHaveLength(4)
    ed().redo()
    expect(city().roads).toHaveLength(2)
  })
})

describe('useCityEditor placements', () => {
  const placed = () => city().placements

  it('a ground tap quick-places the picked source centred on the point and selects it', () => {
    ed().selectSource('tpl:house_small')
    ed().tapGround(10 * CELL, 10 * CELL) // 16x16 -> 2x2 cells centred on the corner point
    expect(placed()).toHaveLength(1)
    expect(placed()[0]).toMatchObject({ source: 'tpl:house_small', cx: 9, cz: 9, rot: 2 })
    expect(ed().selectedPlacementId).toBe(placed()[0].id)
  })

  it('picking the picked card again unpicks it; without a source a ground tap only deselects', () => {
    ed().selectSource('tpl:tree')
    ed().selectSource('tpl:tree')
    expect(ed().selectedSource).toBeNull()
    ed().dropSource('tpl:tree', ...at(4, 4))
    expect(ed().selectedPlacementId).not.toBeNull()
    ed().tapGround(...at(8, 8))
    expect(placed()).toHaveLength(1)
    expect(ed().selectedPlacementId).toBeNull()
  })

  it('turns the front of a new placement towards a road', () => {
    ed().paintRoad({ cx: 5, cz: 3 }, { cx: 12, cz: 3 })
    ed().dropSource('tpl:house_small', 10 * CELL, 5 * CELL)
    expect(placed()[0]).toMatchObject({ cx: 9, cz: 4, rot: 0 })
  })

  it('rejects an overlapping placement without touching history', () => {
    ed().selectSource('tpl:tree')
    ed().tapGround(...at(4, 4))
    const seq = ed().errorSeq
    ed().tapGround(...at(4, 4))
    expect(placed()).toHaveLength(1)
    expect(ed().errorSeq).toBe(seq + 1)
    expect(ed().lastError).toBe('overlap')
    ed().undo()
    expect(placed()).toHaveLength(0)
  })

  it('the action bar rotates, duplicates next to it and deletes the selected placement', () => {
    ed().dropSource('tpl:tree', ...at(4, 4))
    const [tree] = placed()
    ed().rotateSelected()
    expect(placed()[0].rot).toBe((tree.rot + 1) % 4)
    ed().duplicateSelected()
    expect(placed()).toHaveLength(2)
    const copy = placed()[1]
    expect(copy).toMatchObject({ source: 'tpl:tree', cx: tree.cx + 1, cz: tree.cz, rot: (tree.rot + 1) % 4 })
    expect(ed().selectedPlacementId).toBe(copy.id)
    ed().deleteSelected()
    expect(placed().map((p) => p.id)).toEqual([tree.id])
    expect(ed().selectedPlacementId).toBeNull()
    ed().undo()
    ed().undo()
    ed().undo()
    expect(placed()[0].rot).toBe(tree.rot)
  })

  it('moves a placement in one undo step; a blocked move leaves it where it was', () => {
    ed().dropSource('tpl:tree', ...at(4, 4))
    ed().dropSource('tpl:tree', ...at(8, 8))
    const [a, b] = placed()
    ed().movePlacement(a.id, 6, 4)
    expect(placed()[0]).toMatchObject({ cx: 6, cz: 4 })
    expect(ed().selectedPlacementId).toBe(a.id)
    const seq = ed().errorSeq
    ed().movePlacement(a.id, b.cx, b.cz)
    expect(placed()[0]).toMatchObject({ cx: 6, cz: 4 })
    expect(ed().errorSeq).toBe(seq + 1)
    ed().undo()
    expect(placed()[0]).toMatchObject({ cx: a.cx, cz: a.cz })
  })

  it('scales the selected model in place, one undo step each, keeping it selected; refuses what does not fit', () => {
    ed().dropSource('tpl:house_small', ...at(10, 10))
    const [house] = placed()
    ed().scaleSelected(1)
    ed().scaleSelected(1)
    expect(placed()[0]).toMatchObject({ id: house.id, cx: house.cx - 2, cz: house.cz - 2, s: 3 })
    ed().undo()
    expect(placed()[0]).toMatchObject({ cx: house.cx - 1, cz: house.cz - 1, s: 2 })
    expect(ed().selectedPlacementId).toBe(house.id)
    ed().scaleSelected(-1)
    expect(placed()[0]).toEqual(house) // back to x1: no `s`
    let seq = ed().errorSeq
    ed().scaleSelected(-1) // already the smallest
    expect(ed().errorSeq).toBe(seq + 1)
    expect(placed()[0]).toEqual(house)
    // A tree right next to it: growing over it is refused and changes nothing.
    ed().dropSource('tpl:tree', ...at(house.cx + 2, house.cz))
    ed().selectPlacement(house.id)
    seq = ed().errorSeq
    ed().scaleSelected(1)
    expect(ed().lastError).toBe('overlap')
    expect(ed().errorSeq).toBe(seq + 1)
    expect(placed()[0]).toEqual(house)
  })

  it('a duplicate or a move of a scaled model keeps its size', () => {
    ed().dropSource('tpl:tree', ...at(10, 10))
    ed().scaleSelected(1)
    const [tree] = placed()
    ed().duplicateSelected()
    expect(placed()[1]).toMatchObject({ source: 'tpl:tree', s: 2 })
    ed().movePlacement(tree.id, 30, 30)
    expect(placed()[0]).toMatchObject({ cx: 30, cz: 30, s: 2 })
  })

  it('road mode drops the selection', () => {
    ed().dropSource('tpl:tree', ...at(4, 4))
    ed().setRoadMode(true)
    expect(ed().selectedPlacementId).toBeNull()
    expect(ed().roadTool).toBe('paint')
  })

  it('a Kho drop leaves road mode; a refused one leaves nothing selected', () => {
    ed().dropSource('tpl:tree', ...at(4, 4))
    ed().setRoadMode(true)
    ed().dropSource('tpl:tree', ...at(8, 8))
    expect(ed().roadMode).toBe(false)
    expect(ed().selectedPlacementId).toBe(city().placements[1].id)
    ed().dropSource('tpl:tree', ...at(8, 8)) // on top of the last one
    expect(ed().lastError).toBe('overlap')
    expect(ed().selectedPlacementId).toBeNull()
  })

  it('reset forgets the undo history and leaves road mode', () => {
    ed().setRoadMode(true)
    ed().paintRoad({ cx: 0, cz: 0 }, { cx: 0, cz: 0 })
    ed().reset()
    expect(ed().canUndo).toBe(false)
    expect(ed().roadMode).toBe(false)
    ed().undo()
    expect(city().roads).toEqual(['0,0'])
  })
})

describe('useCityEditor stale sources', () => {
  const blueprint = (id: string, part = 'brick_2x4') => ({
    id,
    name: id,
    kind: 'building' as const,
    tags: [],
    baseplate: { w: 16, d: 16 },
    bricks: [{ id: 'a', p: part, x: 0, y: 0, z: 0, r: 0 as const, c: 1 }],
    createdAt: 1,
    updatedAt: 1,
  })

  it('a deleted blueprint is dropped from the place tool instead of adding an invisible placement', () => {
    useGame.getState().upsertBlueprint(blueprint('bpX'))
    ed().selectSource('bpX')
    useGame.getState().deleteBlueprint('bpX')
    const seq = ed().errorSeq
    ed().tapGround(...at(5, 5))
    expect(city().placements).toHaveLength(0)
    expect(ed().selectedSource).toBeNull()
    expect(ed().errorSeq).toBe(seq + 1)
    expect(ed().canUndo).toBe(false)
  })

  it('a blueprint with an unknown part id cannot be placed', () => {
    useGame.getState().upsertBlueprint(blueprint('bpBad', 'no_such_part'))
    ed().selectSource('bpBad')
    ed().tapGround(...at(5, 5))
    expect(city().placements).toHaveLength(0)
    expect(ed().selectedSource).toBeNull()
  })

  it('reset drops a selected source that no longer exists and keeps one that does', () => {
    useGame.getState().upsertBlueprint(blueprint('bpY'))
    ed().selectSource('bpY')
    ed().reset()
    expect(ed().selectedSource).toBe('bpY')
    useGame.setState({ data: createEmptySave() }) // e.g. another save slot was loaded
    ed().reset()
    expect(ed().selectedSource).toBeNull()
  })

  it('a placement whose source is gone can be selected and deleted, never duplicated', () => {
    useGame.getState().setCity({ size: 48, roads: [], placements: [{ id: 'ghost', source: 'gone', cx: 3, cz: 3, rot: 0 }] })
    ed().selectPlacement('ghost')
    ed().duplicateSelected()
    expect(city().placements).toHaveLength(1)
    expect(ed().lastError).toBe('nothing')
    ed().deleteSelected()
    expect(city().placements).toHaveLength(0)
  })
})
