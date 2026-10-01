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
  useCityEditor.setState({ tool: 'place', selectedSource: null, errorSeq: 0 })
  ed().reset()
})

describe('useCityEditor roads', () => {
  it('paints an L-shaped road and undoes it in one step', () => {
    ed().setTool('road')
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

  it('a road-tool tap paints one cell; the erase tool removes it', () => {
    ed().setTool('road')
    ed().tapGround(...at(5, 6))
    expect(city().roads).toEqual(['5,6'])
    ed().setTool('erase')
    ed().tapGround(...at(5, 6))
    expect(city().roads).toEqual([])
  })
})

describe('useCityEditor placements', () => {
  it('selecting a source switches to the place tool; a tap places it centred on the point', () => {
    ed().setTool('road')
    ed().selectSource('tpl:house_small')
    expect(ed().tool).toBe('place')
    ed().tapGround(10 * CELL, 10 * CELL) // 16x16 -> 2x2 cells centred on the corner point
    expect(city().placements).toHaveLength(1)
    expect(city().placements[0]).toMatchObject({ source: 'tpl:house_small', cx: 9, cz: 9, rot: 2 })
  })

  it('turns the front of a new placement towards a road', () => {
    ed().paintRoad({ cx: 5, cz: 3 }, { cx: 12, cz: 3 })
    ed().selectSource('tpl:house_small')
    ed().tapGround(10 * CELL, 5 * CELL)
    expect(city().placements[0]).toMatchObject({ cx: 9, cz: 4, rot: 0 })
  })

  it('rejects an overlapping placement without touching history', () => {
    ed().selectSource('tpl:tree')
    ed().tapGround(...at(4, 4))
    const seq = ed().errorSeq
    ed().tapGround(...at(4, 4))
    expect(city().placements).toHaveLength(1)
    expect(ed().errorSeq).toBe(seq + 1)
    expect(ed().lastError).toBe('overlap')
    ed().undo()
    expect(city().placements).toHaveLength(0)
  })

  it('without a selected source the place tool does nothing on the ground', () => {
    ed().tapGround(...at(4, 4))
    expect(city().placements).toHaveLength(0)
  })

  it('place-tool tap on a placement selects it; rotate and erase act on it', () => {
    ed().selectSource('tpl:tree')
    ed().tapGround(...at(4, 4))
    const id = city().placements[0].id
    ed().tapPlacement(id)
    expect(ed().selectedPlacementId).toBe(id)

    ed().setTool('rotate')
    expect(ed().selectedPlacementId).toBeNull()
    const rot = city().placements[0].rot
    ed().tapPlacement(id)
    expect(city().placements[0].rot).toBe((rot + 1) % 4)

    ed().setTool('erase')
    ed().tapPlacement(id)
    expect(city().placements).toHaveLength(0)
    ed().undo()
    ed().undo()
    expect(city().placements[0].rot).toBe(rot)
  })

  it('reset forgets the undo history', () => {
    ed().paintRoad({ cx: 0, cz: 0 }, { cx: 0, cz: 0 })
    ed().reset()
    expect(ed().canUndo).toBe(false)
    ed().undo()
    expect(city().roads).toEqual(['0,0'])
  })
})
