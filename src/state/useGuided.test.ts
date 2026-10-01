import { beforeEach, describe, expect, it } from 'vitest'
import { TEMPLATES, getTemplate } from '../content/templates'
import { createEmptySave } from '../core/serialize'
import { trayCards } from '../core/guidedTray'
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
  useGuided.setState({ viewStep: 0, errorSeq: 0, celebration: null, cardRots: {}, selectedCard: null, dropped: false })
  useApp.setState({ lang: 'vi' })
  useEditor.setState({ partId: 'brick_1x1', color: 0, rot: 0, category: 'brick' })
})

describe('useGuided.start', () => {
  it('starts at step 0 with nothing placed, leaving the workshop editor alone', () => {
    g().start('tree')
    expect(guided()).toEqual({ templateId: 'tree', step: 0, placed: [] })
    expect(g().viewStep).toBe(0)
    const ed = useEditor.getState()
    expect([ed.partId, ed.color, ed.rot]).toEqual(['brick_1x1', 0, 0])
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
  it('restores saved progress: views the current step with an unturned tray', () => {
    g().start('tree')
    g().placeGhost(pending().id)
    g().prevStep()
    g().rotateCard()
    g().resume()
    expect(g().viewStep).toBe(1)
    expect(g().cardRots).toEqual({})
    expect(g().cards().map((c) => c.bricks[0].id)).toEqual([pending().id])
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

describe('useGuided tray', () => {
  const bench = getTemplate('bench')!
  /** Places every brick of the current step (via the store). */
  const finishStep = () => {
    const step = guided()!.step
    while (guided() && guided()!.step === step) g().placeGhost(pending().id)
  }

  it("lists the current step's still-needed bricks as cards", () => {
    expect(g().cards()).toEqual([])
    g().start('bench')
    const first = bench.steps[0].map((i) => bench.bricks[i])
    expect(g().cards()).toEqual(trayCards(first))
    g().placeGhost(first[0].id)
    expect(g().cards()).toEqual(trayCards(first.slice(1)))
  })

  it('↻ turns the selected card a quarter turn at a time; other cards keep their own rotation', () => {
    g().start('bench')
    finishStep() // step 2: a plate 2x4 and a plate 2x2
    const [a, b] = g().cards()
    expect(g().cardRot(a.key)).toBe(0)
    g().rotateCard() // nothing selected: turns the first card
    expect(g().cardRot(a.key)).toBe(1)
    g().selectCard(b.key)
    g().rotateCard()
    g().rotateCard()
    expect([g().cardRot(a.key), g().cardRot(b.key)]).toEqual([1, 2])
    g().selectCard(a.key)
    for (let i = 0; i < 3; i++) g().rotateCard()
    expect(g().cardRot(a.key)).toBe(0)
  })

  it('forgets turns and the selection when a new step starts', () => {
    g().start('bench')
    g().rotateCard()
    g().selectCard(g().cards()[0].key)
    finishStep()
    expect(g().cardRots).toEqual({})
    expect(g().selectedCard).toBeNull()
  })

  it('↻ does nothing without a build', () => {
    g().rotateCard()
    expect(g().cardRots).toEqual({})
  })

  it('dropOn (easy): places the pending brick the piece snapped to and notes the first drop', () => {
    g().start('tree')
    const target = pending()
    expect(g().dropped).toBe(false)
    expect(g().dropOn(target.id)).toEqual(target)
    expect(guided()!.placed).toEqual([target.id])
    expect(g().dropped).toBe(true)
  })

  it('dropOn refuses a brick that is not pending, without noting a drop', () => {
    g().start('tree')
    const later = tree.bricks[tree.steps[tree.steps.length - 1][0]]
    expect(g().dropOn(later.id)).toBeNull()
    expect(g().dropped).toBe(false)
    expect(guided()!.placed).toEqual([])
  })

  it('dropAt (normal): places a matching candidate (any equivalent rotation) and returns the template brick', () => {
    g().start('bench')
    finishStep()
    const plate = pending() // plate 2x4 turned once (r = 1)
    expect(plate).toMatchObject({ p: 'plate_2x4', r: 1 })
    expect(g().dropAt({ ...plate, r: 3 })).toEqual(plate)
    expect(guided()!.placed).toContain(plate.id)
    expect(g().dropped).toBe(true)
  })

  it('dropAt rejects a wrong rotation: shakes (errorSeq), places nothing, notes no drop', () => {
    g().start('bench')
    finishStep()
    const plate = pending()
    const before = guided()!.placed
    expect(g().dropAt({ ...plate, r: 0 })).toBeNull()
    expect(g().errorSeq).toBe(1)
    expect(guided()!.placed).toEqual(before)
    expect(g().dropped).toBe(false)
  })

  it('a drop that ends the model still celebrates', () => {
    g().start('tree')
    for (let i = 0; i < tree.bricks.length - 1; i++) g().placeGhost(pending().id)
    expect(g().dropOn(pending().id)).not.toBeNull()
    expect(g().celebration?.templateId).toBe('tree')
  })
})
