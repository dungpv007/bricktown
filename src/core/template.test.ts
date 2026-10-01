import { describe, expect, it } from 'vitest'
import {
  autoSteps,
  findMatch,
  matchesTarget,
  nextPending,
  placedBricks,
  stepComplete,
  templateToBlueprint,
  validateTemplate,
} from './template'
import { figPreset } from './figures'
import type { Brick, Rot, Template } from './types'

const brick = (id: string, p: string, x: number, y: number, z: number, r: Rot = 0, c = 2): Brick => ({
  id, p, x, y, z, r, c,
})

const sample = (): Template => {
  const bricks = [
    brick('t-0', 'brick_2x2', 0, 0, 0),
    brick('t-1', 'brick_2x4', 2, 0, 0),
    brick('t-2', 'plate_2x2', 0, 3, 0, 0, 3),
  ]
  return {
    id: 't',
    name: { vi: 'Thử', en: 'Test' },
    difficulty: 1,
    kind: 'prop',
    tags: ['x'],
    baseplate: { w: 8, d: 8 },
    bricks,
    steps: [[0, 1], [2]],
  }
}

describe('autoSteps', () => {
  it('orders by y, z, x and starts a new step for every layer', () => {
    const bricks = [
      brick('a', 'brick_1x1', 3, 3, 0),
      brick('b', 'brick_1x1', 1, 0, 1),
      brick('c', 'brick_1x1', 0, 0, 1),
      brick('d', 'brick_1x1', 0, 0, 0),
    ]
    expect(autoSteps(bricks)).toEqual([[3, 2, 1], [0]])
  })

  it('splits a layer into steps of at most maxPerStep', () => {
    const bricks = Array.from({ length: 10 }, (_, i) => brick(`b${i}`, 'brick_1x1', i, 0, 0))
    const steps = autoSteps(bricks)
    expect(steps.map((s) => s.length)).toEqual([4, 4, 2])
    expect(autoSteps(bricks, 3).map((s) => s.length)).toEqual([3, 3, 3, 1])
  })

  it('uses every index exactly once', () => {
    const bricks = Array.from({ length: 13 }, (_, i) => brick(`b${i}`, 'brick_1x1', i % 3, (i % 4) * 3, i % 5))
    const flat = autoSteps(bricks).flat().sort((a, b) => a - b)
    expect(flat).toEqual(bricks.map((_, i) => i))
  })

  it('never produces an empty step when maxPerStep <= 0 (clamps to 1)', () => {
    const bricks = [brick('a', 'brick_1x1', 0, 0, 0), brick('b', 'brick_1x1', 1, 0, 0)]
    expect(autoSteps(bricks, 0)).toEqual([[0], [1]])
    expect(autoSteps(bricks, -3)).toEqual([[0], [1]])
  })
  it('handles no bricks', () => {
    expect(autoSteps([])).toEqual([])
  })
})

describe('matchesTarget', () => {
  const target = brick('t', 'brick_2x4', 1, 0, 1, 0, 2)
  it('accepts an identical placement', () => {
    expect(matchesTarget({ p: 'brick_2x4', x: 1, y: 0, z: 1, r: 0, c: 2 }, target)).toBe(true)
  })
  it('accepts a rotation-equivalent placement (sym 2: r=2 equals r=0)', () => {
    expect(matchesTarget({ p: 'brick_2x4', x: 1, y: 0, z: 1, r: 2, c: 2 }, target)).toBe(true)
  })
  it('rejects a quarter turn of an asymmetric footprint', () => {
    expect(matchesTarget({ p: 'brick_2x4', x: 1, y: 0, z: 1, r: 1, c: 2 }, target)).toBe(false)
  })
  it('rejects a different rotation of a non-symmetric part (slope)', () => {
    const slope = brick('s', 'slope_2x2', 0, 0, 0, 0)
    expect(matchesTarget({ p: 'slope_2x2', x: 0, y: 0, z: 0, r: 2, c: 2 }, slope)).toBe(false)
  })
  it('rejects a different part, color or position', () => {
    expect(matchesTarget({ p: 'brick_2x2', x: 1, y: 0, z: 1, r: 0, c: 2 }, target)).toBe(false)
    expect(matchesTarget({ p: 'brick_2x4', x: 1, y: 0, z: 1, r: 0, c: 3 }, target)).toBe(false)
    expect(matchesTarget({ p: 'brick_2x4', x: 2, y: 0, z: 1, r: 0, c: 2 }, target)).toBe(false)
    expect(matchesTarget({ p: 'brick_2x4', x: 1, y: 3, z: 1, r: 0, c: 2 }, target)).toBe(false)
    expect(matchesTarget({ p: 'brick_2x4', x: 1, y: 0, z: 2, r: 0, c: 2 }, target)).toBe(false)
  })
  it('matches a figure by position and facing only: its style (and torso colour) comes from the template', () => {
    const police: Brick = { ...brick('f', 'minifig', 2, 0, 3, 1, 21), fig: figPreset('police') }
    expect(matchesTarget({ p: 'minifig', x: 2, y: 0, z: 3, r: 1, c: 0 }, police)).toBe(true)
    expect(matchesTarget({ p: 'minifig', x: 2, y: 0, z: 3, r: 1, c: 21 }, police)).toBe(true)
    // A figure faces one way: every other rotation is a different placement.
    for (const r of [0, 2, 3] as Rot[]) expect(matchesTarget({ p: 'minifig', x: 2, y: 0, z: 3, r, c: 21 }, police)).toBe(false)
    expect(matchesTarget({ p: 'minifig', x: 3, y: 0, z: 3, r: 1, c: 21 }, police)).toBe(false)
    expect(matchesTarget({ p: 'brick_1x2', x: 2, y: 0, z: 3, r: 1, c: 21 }, police)).toBe(false)
  })
})

describe('step progress', () => {
  const t = sample()
  const cand = { p: 'brick_2x4', x: 2, y: 0, z: 0, r: 0 as Rot, c: 2 }

  it('findMatch returns the pending brick of the current step', () => {
    expect(findMatch(t, 0, [], cand)?.id).toBe('t-1')
  })
  it('findMatch ignores bricks already placed and bricks of other steps', () => {
    expect(findMatch(t, 0, ['t-1'], cand)).toBeNull()
    expect(findMatch(t, 1, [], cand)).toBeNull()
    expect(findMatch(t, 9, [], cand)).toBeNull()
  })
  it('nextPending returns the first unplaced brick in step order', () => {
    expect(nextPending(t, 0, [])?.id).toBe('t-0')
    expect(nextPending(t, 0, ['t-0'])?.id).toBe('t-1')
    expect(nextPending(t, 0, ['t-0', 't-1'])).toBeNull()
  })
  it('stepComplete is true once every brick of the step is placed', () => {
    expect(stepComplete(t, 0, ['t-0'])).toBe(false)
    expect(stepComplete(t, 0, ['t-1', 't-0'])).toBe(true)
    expect(stepComplete(t, 1, ['t-0', 't-1'])).toBe(false)
  })
})

describe('placedBricks', () => {
  const t = sample()
  it('returns template bricks whose id is in guided.placed', () => {
    const placed = placedBricks(t, { templateId: 't', step: 1, placed: ['t-2', 't-0'] })
    expect(placed.map((b) => b.id)).toEqual(['t-0', 't-2'])
  })
  it('returns nothing without guided state', () => {
    expect(placedBricks(t, null)).toEqual([])
  })
})

describe('templateToBlueprint', () => {
  const t = sample()
  it('uses the language name, template id, and copies bricks', () => {
    const vi = templateToBlueprint(t, 'vi')
    const en = templateToBlueprint(t, 'en')
    expect(vi.name).toBe('Thử')
    expect(en.name).toBe('Test')
    expect(vi.templateId).toBe('t')
    expect(vi.kind).toBe('prop')
    expect(vi.baseplate).toEqual({ w: 8, d: 8 })
    expect(vi.bricks).toEqual(t.bricks)
    expect(vi.bricks).not.toBe(t.bricks)
    expect(vi.id).not.toBe(en.id)
  })
  it('keeps the template plate colour', () => {
    const grey = { ...sample(), baseplate: { w: 8, d: 8, c: 24 } }
    expect(templateToBlueprint(grey, 'vi').baseplate).toEqual({ w: 8, d: 8, c: 24 })
  })
})

describe('validateTemplate', () => {
  it('accepts a sound template', () => {
    expect(validateTemplate(sample())).toEqual([])
  })
  it('accepts a plate colour and reports one that is not a colour', () => {
    expect(validateTemplate({ ...sample(), baseplate: { w: 8, d: 8, c: 24 } })).toEqual([])
    expect(validateTemplate({ ...sample(), baseplate: { w: 8, d: 8, c: 99 } })).toEqual(['baseplate: color 99 out of range'])
  })
  it('reports bricks missing from steps and bricks listed twice', () => {
    const t = { ...sample(), steps: [[0, 1], [1]] }
    const problems = validateTemplate(t)
    expect(problems.some((p) => p.includes('t-2') && p.includes('not in any step'))).toBe(true)
    expect(problems.some((p) => p.includes('t-1') && p.includes('2 steps'))).toBe(true)
  })
  it('reports unplaceable bricks in step order (floating or wrong order)', () => {
    const t = { ...sample(), steps: [[2], [0, 1]] }
    expect(validateTemplate(t).some((p) => p.includes('t-2') && p.includes('unsupported'))).toBe(true)
  })
  it('reports collisions and out-of-bounds', () => {
    const t = sample()
    t.bricks.push(brick('t-3', 'brick_2x2', 1, 0, 0), brick('t-4', 'brick_2x2', 7, 0, 7))
    t.steps = [[0, 1], [2], [3, 4]]
    const problems = validateTemplate(t)
    expect(problems.some((p) => p.includes('t-3') && p.includes('collision'))).toBe(true)
    expect(problems.some((p) => p.includes('t-4') && p.includes('out_of_bounds'))).toBe(true)
  })
  it('reports unknown parts and out-of-range colors', () => {
    const t = sample()
    t.bricks.push(brick('t-3', 'nope', 0, 0, 5), brick('t-4', 'brick_1x1', 6, 0, 5, 0, 99))
    t.steps = [[0, 1], [2], [3, 4]]
    const problems = validateTemplate(t)
    expect(problems.some((p) => p.includes('unknown part nope'))).toBe(true)
    expect(problems.some((p) => p.includes('color 99 out of range'))).toBe(true)
  })
  it('reports a brick that only rests on a brick of its own step (kids may place in any order)', () => {
    const t = sample()
    // t-3 sits on t-2 (y=3, plate h=1 -> y=4) but both are in the same step.
    t.bricks.push(brick('t-3', 'plate_2x2', 0, 4, 0))
    t.steps = [[0, 1], [2, 3]]
    expect(validateTemplate(t).some((p) => p.includes('t-3') && p.includes('unsupported'))).toBe(true)
  })
  it('still reports collisions between bricks of the same step', () => {
    const t = sample()
    t.bricks.push(brick('t-3', 'plate_2x2', 1, 3, 0))
    t.steps = [[0, 1], [2, 3]]
    expect(validateTemplate(t).some((p) => p.includes('t-3') && p.includes('collision'))).toBe(true)
  })
  it('reports empty steps', () => {
    const t = { ...sample(), steps: [[0, 1], [], [2]] }
    expect(validateTemplate(t).some((p) => p.includes('step 1') && p.includes('empty'))).toBe(true)
  })
  it('reports out-of-range step indices', () => {
    const t = { ...sample(), steps: [[0, 1], [2, 7]] }
    expect(validateTemplate(t).some((p) => p.includes('unknown brick index 7'))).toBe(true)
  })
  it('accepts figures with a valid style and reports a style that is not valid', () => {
    const t = sample()
    t.bricks.push({ ...brick('t-3', 'minifig', 4, 0, 4, 0, 0), fig: figPreset('chef') })
    t.steps = [[0, 1], [2], [3]]
    expect(validateTemplate(t)).toEqual([])
    t.bricks[3] = { ...t.bricks[3], fig: figPreset('police') } // optional fields in any order
    expect(validateTemplate(t)).toEqual([])
    t.bricks[3] = { ...t.bricks[3], fig: { ...figPreset('police'), accessory: 'sword' as never } }
    expect(validateTemplate(t)).toEqual(['brick t-3: invalid figure style'])
    t.bricks[3] = { ...t.bricks[3], fig: { ...figPreset('chef'), hat: 'wizard' as never } }
    expect(validateTemplate(t)).toEqual(['brick t-3: invalid figure style'])
  })
})
