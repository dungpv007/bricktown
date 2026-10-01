import { beforeEach, describe, expect, it } from 'vitest'
import { TEMPLATES, getTemplate } from '../content/templates'
import { createEmptySave } from '../core/serialize'
import { nextPending } from '../core/template'
import type { Brick, Template } from '../core/types'
import { useApp } from './useApp'
import { useEditor } from './useEditor'
import { useGame } from './useGame'
import { useGuided } from './useGuided'

const g = () => useGuided.getState()
const guided = () => useGame.getState().data.guided
const tree = getTemplate('tree')!
/** A template with at least one step of two or more bricks. */
const multi: Template = TEMPLATES.find((t) => t.steps.some((s) => s.length >= 2))!
const pending = (): Brick => {
  const s = guided()!
  return nextPending(getTemplate(s.templateId)!, s.step, s.placed)!
}

const WORKSHOP_BRICK: Brick = { id: 'free', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 3 }

beforeEach(() => {
  const data = createEmptySave()
  data.workshop = { ...data.workshop, bricks: [WORKSHOP_BRICK] }
  useGame.setState({ data })
  useGuided.setState({ viewStep: 0, errorSeq: 0, celebration: null })
  useApp.setState({ lang: 'vi' })
  useEditor.setState({ partId: 'brick_1x1', color: 0, rot: 0, category: 'brick' })
})

describe('useGuided.start', () => {
  it('starts at step 0 with nothing placed and selects the first brick in the editor', () => {
    g().start('tree')
    expect(guided()).toEqual({ templateId: 'tree', step: 0, placed: [] })
    expect(g().viewStep).toBe(0)
    const first = nextPending(tree, 0, [])!
    const ed = useEditor.getState()
    expect([ed.partId, ed.color, ed.rot]).toEqual([first.p, first.c, first.r])
  })

  it('ignores unknown templates', () => {
    g().start('nope')
    expect(guided()).toBeNull()
  })
})

describe('useGuided.tryPlace', () => {
  it('accepts a matching candidate, marks it placed and advances when the step is complete', () => {
    g().start('tree')
    const target = pending()
    expect(g().tryPlace({ ...target })).toBe(true)
    expect(guided()!.placed).toEqual([target.id])
    expect(guided()!.step).toBe(1)
    expect(g().viewStep).toBe(1)
  })

  it('auto-selects the next pending brick when the step advances', () => {
    g().start('tree')
    g().tryPlace({ ...pending() })
    const next = pending()
    const ed = useEditor.getState()
    expect([ed.partId, ed.color, ed.rot]).toEqual([next.p, next.c, next.r])
  })

  it('rejects a wrong candidate, bumps errorSeq and changes nothing', () => {
    g().start('tree')
    const target = pending()
    expect(g().tryPlace({ ...target, c: (target.c + 1) % 16 })).toBe(false)
    expect(g().tryPlace({ ...target, x: target.x + 1 })).toBe(false)
    expect(g().errorSeq).toBe(2)
    expect(guided()).toEqual({ templateId: 'tree', step: 0, placed: [] })
  })

  it('stays on a step until all of its bricks are placed, in any order', () => {
    g().start(multi.id)
    // Place everything before the first multi-brick step.
    while (getTemplate(multi.id)!.steps[guided()!.step].length < 2) g().placeGhost(pending().id)
    const stepIndex = guided()!.step
    const ids = multi.steps[stepIndex].map((i) => multi.bricks[i])
    const last = ids[ids.length - 1]
    expect(g().tryPlace({ ...last })).toBe(true)
    expect(guided()!.step).toBe(stepIndex)
    for (const b of ids.slice(0, -1)) g().tryPlace({ ...b })
    expect(guided()!.step).toBe(stepIndex + 1)
  })

  it('does nothing without an active build', () => {
    expect(g().tryPlace({ ...tree.bricks[0] })).toBe(false)
  })
})

describe('useGuided.pending', () => {
  it('lists the unplaced bricks of the current step', () => {
    expect(g().pending()).toEqual([])
    g().start(multi.id)
    const firstStep = multi.steps[0].map((i) => multi.bricks[i])
    expect(g().pending()).toEqual(firstStep)
    g().placeGhost(firstStep[0].id)
    expect(g().pending()).toEqual(firstStep.length > 1 ? firstStep.slice(1) : multi.steps[1].map((i) => multi.bricks[i]))
  })
})

describe('useGuided.placeGhost', () => {
  it('places a pending brick of the current step by id', () => {
    g().start('tree')
    const target = pending()
    expect(g().placeGhost(target.id)).toBe(true)
    expect(guided()!.placed).toContain(target.id)
  })

  it('refuses bricks of other steps or already placed', () => {
    g().start('tree')
    const first = pending()
    const later = tree.bricks[tree.steps[tree.steps.length - 1][0]]
    expect(g().placeGhost(later.id)).toBe(false)
    g().placeGhost(first.id)
    expect(g().placeGhost(first.id)).toBe(false)
    expect(guided()!.placed).toEqual([first.id])
  })
})

describe('useGuided completion', () => {
  it('saves a blueprint, marks the template completed, clears progress and celebrates', () => {
    g().start('tree')
    for (let i = 0; i < tree.bricks.length; i++) g().placeGhost(pending().id)
    const bps = useGame.getState().data.blueprints
    expect(bps).toHaveLength(1)
    expect(bps[0]).toMatchObject({ templateId: 'tree', name: tree.name.vi, kind: tree.kind })
    expect(bps[0].bricks).toHaveLength(tree.bricks.length)
    expect(useGame.getState().data.completedTemplates).toEqual(['tree'])
    expect(guided()).toBeNull()
    expect(g().celebration).toEqual({ templateId: 'tree', blueprintId: bps[0].id })
  })

  it('never touches the free-build workshop model', () => {
    g().start('tree')
    for (let i = 0; i < tree.bricks.length; i++) g().placeGhost(pending().id)
    expect(useGame.getState().data.workshop.bricks).toEqual([WORKSHOP_BRICK])
  })

  it('dismissCelebration clears the celebration', () => {
    g().start('tree')
    for (let i = 0; i < tree.bricks.length; i++) g().placeGhost(pending().id)
    g().dismissCelebration()
    expect(g().celebration).toBeNull()
  })
})

describe('useGuided step viewing', () => {
  it('prevStep/nextStep move the viewed step between 0 and the current step without undoing', () => {
    g().start('tree')
    g().placeGhost(pending().id)
    g().placeGhost(pending().id)
    expect(guided()!.step).toBe(2)
    g().prevStep()
    g().prevStep()
    g().prevStep()
    expect(g().viewStep).toBe(0)
    expect(guided()!.placed).toHaveLength(2)
    g().nextStep()
    g().nextStep()
    g().nextStep()
    expect(g().viewStep).toBe(2)
  })
})

describe('useGuided.resume', () => {
  it('restores saved progress: views the current step and re-selects its pending brick', () => {
    g().start('tree')
    g().placeGhost(pending().id)
    g().prevStep()
    useEditor.setState({ partId: 'brick_1x1', color: 0, rot: 0 })
    g().resume()
    expect(g().viewStep).toBe(1)
    const next = pending()
    expect(useEditor.getState().partId).toBe(next.p)
  })

  it('drops saved progress for a template that no longer exists', () => {
    useGame.getState().setGuided({ templateId: 'gone', step: 0, placed: [] })
    g().resume()
    expect(guided()).toBeNull()
  })

  it('repairs a stale step index from the placed bricks', () => {
    const firstStepIds = tree.steps[0].map((i) => tree.bricks[i].id)
    useGame.getState().setGuided({ templateId: 'tree', step: 0, placed: firstStepIds })
    g().resume()
    expect(guided()!.step).toBe(1)
  })
})

describe('useGuided celebration lifetime', () => {
  it('is cleared when leaving guided mode, so re-entering never flashes it', () => {
    useApp.setState({ mode: 'guided' })
    useGuided.setState({ celebration: { templateId: 'tree', blueprintId: 'bp' } })
    useApp.setState({ mode: 'menu' })
    expect(g().celebration).toBeNull()
  })

  it('is kept while switching between other modes', () => {
    useApp.setState({ mode: 'workshop' })
    useGuided.setState({ celebration: { templateId: 'tree', blueprintId: 'bp' } })
    useApp.setState({ mode: 'menu' })
    expect(g().celebration).not.toBeNull()
    useGuided.setState({ celebration: null })
  })
})
