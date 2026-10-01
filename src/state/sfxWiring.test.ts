import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../audio/sfx', () => ({
  snap: vi.fn(),
  pop: vi.fn(),
  paint: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
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
  ed().setTool('place')
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

  it('paint and pop for the paint and delete tools', () => {
    ed().place(0, 0, 0)
    const { id, c } = useGame.getState().data.workshop.bricks[0]
    ed().setTool('paint')
    ed().setColor(c + 1) // a different colour: repainting the same one is a silent no-op
    ed().tapBrick(id)
    expect(sfx.paint).toHaveBeenCalledTimes(1)
    ed().setTool('delete')
    ed().tapBrick(id)
    expect(sfx.pop).toHaveBeenCalledTimes(1)
  })
})

describe('guided sounds', () => {
  beforeEach(() => g().start('tree'))

  it('plays success when a step (or the template) completes and snap for other correct placements', () => {
    let steps = 0
    let snaps = 0
    while (useGame.getState().data.guided) {
      const before = useGame.getState().data.guided!.step
      vi.clearAllMocks()
      g().placeGhost(pendingBrick().id)
      const after = useGame.getState().data.guided?.step ?? Infinity
      if (after > before) {
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
