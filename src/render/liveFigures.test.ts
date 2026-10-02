import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../content/templates'
import { DEFAULT_FIG, figKey, figOf, figPreset, isFigure } from '../core/figures'
import type { Brick, SaveData } from '../core/types'
import { liveFigureKeys } from './liveFigures'

const figure = (id: string, preset: string): Brick => ({ id, p: 'minifig', x: 0, y: 0, z: 0, r: 0, c: 0, fig: figPreset(preset) })
const data = (bricks: Brick[], guided: SaveData['guided'] = null) =>
  ({ workshop: { baseplate: { w: 16, d: 16 }, bricks }, guided }) as Pick<SaveData, 'workshop' | 'guided'>

describe('liveFigureKeys', () => {
  it("holds the Workshop's figures, the next figure's look and the default figure", () => {
    const keys = liveFigureKeys(data([figure('a', 'chef'), { id: 'b', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 0 }]), figPreset('robber'))
    expect(keys).toEqual(new Set([figKey(DEFAULT_FIG), figKey(figPreset('robber')), figKey(figPreset('chef'))]))
  })

  it("holds every figure of the Guided build's template", () => {
    const tpl = TEMPLATES.find((t) => t.bricks.some(isFigure))!
    const keys = liveFigureKeys(data([], { templateId: tpl.id, step: 0, placed: [] }), DEFAULT_FIG)
    for (const b of tpl.bricks.filter(isFigure)) expect(keys.has(figKey(figOf(b)))).toBe(true)
  })

  it('holds every figure of a Guided build from a template shared with steps', () => {
    const tpl = TEMPLATES.find((t) => t.bricks.some(isFigure))!
    const shared = { ...tpl, id: 'shared_abc123', bricks: [figure('f1', 'robber')] }
    const keys = liveFigureKeys(
      { ...data([], { templateId: shared.id, step: 0, placed: [] }), sharedTemplates: [shared] },
      DEFAULT_FIG,
    )
    expect(keys.has(figKey(figPreset('robber')))).toBe(true)
  })
})
