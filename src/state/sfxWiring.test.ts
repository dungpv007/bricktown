import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../audio/sfx', () => ({
  snap: vi.fn(),
  pop: vi.fn(),
  paint: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  fanfare: vi.fn(),
  whoosh: vi.fn(),
  thunk: vi.fn(),
  coin: vi.fn(),
  horn: vi.fn(),
}))

import * as sfx from '../audio/sfx'
import { getTemplate } from '../content/templates'
import { createEmptySave } from '../core/serialize'
import { nextPending } from '../core/template'
import { useEditor } from './useEditor'
import { useGame } from './useGame'
import { useGuided } from './useGuided'

const ed = () => useEditor.getState()
const g = () => useGuided.getState()
const tree = getTemplate('tree')!
const pendingBrick = () => {
  const s = useGame.getState().data.guided!
  return nextPending(tree, s.step, s.placed)!
}

beforeEach(() => {
  vi.clearAllMocks()
  useGame.setState({ data: createEmptySave() })
  ed().newModel('building', { w: 16, d: 16 })
  ed().setPart('brick_2x4')
  useEditor.setState({ rot: 0 })
})

describe('workshop sounds', () => {
  it('snap on place, error on a rejected place', () => {
    ed().place(0, 0, 0)
    expect(sfx.snap).toHaveBeenCalledTimes(1)
    ed().place(0, 0, 0)
    expect(sfx.error).toHaveBeenCalledTimes(1)
    expect(sfx.snap).toHaveBeenCalledTimes(1)
  })

  it('paint and pop for recolouring and deleting the selected brick', () => {
    ed().place(0, 0, 0) // and selects it
    const { c } = useGame.getState().data.workshop.bricks[0]
    ed().paintSelected(c + 1) // a different colour: repainting the same one is a silent no-op
    expect(sfx.paint).toHaveBeenCalledTimes(1)
    ed().deleteSelected()
    expect(sfx.pop).toHaveBeenCalledTimes(1)
  })

  it('snap for a move, a turn and a copy of the selected brick', () => {
    ed().place(0, 0, 0)
    const { id } = useGame.getState().data.workshop.bricks[0]
    vi.clearAllMocks()
    ed().moveBrick(id, { x: 4, y: 0, z: 4 })
    ed().rotateSelected()
    ed().duplicateSelected()
    expect(sfx.snap).toHaveBeenCalledTimes(3)
    expect(sfx.error).not.toHaveBeenCalled()
  })
  it('snap on plate grow, pop on shrink, error on a rejected resize', () => {
    ed().resizePlate('E', 'grow')
    expect(sfx.snap).toHaveBeenCalledTimes(1)
    ed().resizePlate('E', 'shrink')
    expect(sfx.pop).toHaveBeenCalledTimes(1)
    ed().place(0, 0, 0)
    vi.clearAllMocks()
    ed().resizePlate('W', 'shrink') // a brick sits in the W strip
    expect(sfx.error).toHaveBeenCalledTimes(1)
    expect(sfx.pop).not.toHaveBeenCalled()
  })
})

describe('guided sounds', () => {
  beforeEach(() => g().start('tree'))

  it('plays success when a step completes, a fanfare when the template does, and snap otherwise', () => {
    let steps = 0
    let snaps = 0
    while (useGame.getState().data.guided) {
      const before = useGame.getState().data.guided!.step
      vi.clearAllMocks()
      g().placeGhost(pendingBrick().id)
      const finished = useGame.getState().data.guided === null
      const after = useGame.getState().data.guided?.step ?? Infinity
      if (finished) {
        expect(sfx.fanfare).toHaveBeenCalledTimes(1)
        expect(sfx.success).not.toHaveBeenCalled()
        expect(sfx.snap).not.toHaveBeenCalled()
        steps++
      } else if (after > before) {
        expect(sfx.success).toHaveBeenCalledTimes(1)
        expect(sfx.snap).not.toHaveBeenCalled()
        steps++
      } else {
        expect(sfx.snap).toHaveBeenCalledTimes(1)
        expect(sfx.success).not.toHaveBeenCalled()
        snaps++
      }
    }
    expect(steps).toBe(tree.steps.length)
    expect(snaps).toBe(tree.bricks.length - tree.steps.length)
    expect(g().celebration).not.toBeNull()
  })

  it('plays error for a wrong placement and nothing else', () => {
    const b = pendingBrick()
    g().tryPlace({ ...b, x: b.x + 1 })
    expect(sfx.error).toHaveBeenCalledTimes(1)
    expect(sfx.snap).not.toHaveBeenCalled()
    expect(sfx.success).not.toHaveBeenCalled()
  })
})
