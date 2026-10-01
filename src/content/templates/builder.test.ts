import { describe, expect, it } from 'vitest'
import { figPreset } from '../../core/figures'
import { validateTemplate } from '../../core/template'
import { createBuilder } from './builder'

describe('template builder steps', () => {
  const build = (stepSize?: number) => {
    const b = createBuilder()
    b.plates(0, 0, 0, 7, 7, 7)
    const opening = b.count()
    for (let x = 0; x < 8; x++) b.add('brick_1x1', x, 1, 0, 0, 2)
    return b.done({ id: 's', name: { vi: 's', en: 's' }, difficulty: 1, kind: 'prop', tags: [], baseplate: { w: 8, d: 8 }, openingCount: opening, stepSize })
  }
  it('groups the bricks after the opening four per step by default', () => {
    expect(build().steps.slice(-2).map((s) => s.length)).toEqual([4, 4])
  })
  it('takes a bigger step size, capped at the opening step size', () => {
    expect(build(6).steps.slice(-2).map((s) => s.length)).toEqual([6, 2])
    expect(build(10).steps.slice(-2).map((s) => s.length)).toEqual([6, 2])
  })
})

describe('template builder figures', () => {
  it('adds a preset figure by id, its colour following the torso', () => {
    const b = createBuilder()
    b.plates(0, 0, 0, 3, 3, 7)
    const police = b.fig('police', 1, 1, 1, 2)
    expect(police).toMatchObject({ p: 'minifig', x: 1, y: 1, z: 1, r: 2, c: figPreset('police').torso, fig: figPreset('police') })
    const t = b.done({ id: 'figs', name: { vi: 'x', en: 'x' }, difficulty: 1, kind: 'prop', tags: [], baseplate: { w: 4, d: 4 } })
    expect(t.bricks[t.bricks.length - 1]).toMatchObject({ id: `figs-${t.bricks.length - 1}`, fig: figPreset('police') })
    expect(validateTemplate(t)).toEqual([])
  })

  it('takes a custom style too, and rejects an unknown preset', () => {
    const b = createBuilder()
    const style = { ...figPreset('chef'), torso: 2 }
    expect(b.fig(style, 0, 0, 0, 0)).toMatchObject({ c: 2, fig: style })
    expect(() => b.fig('nope', 0, 0, 0, 0)).toThrow()
  })
})
