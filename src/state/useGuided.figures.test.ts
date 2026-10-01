import { beforeEach, describe, expect, it, vi } from 'vitest'
import { figPreset } from '../core/figures'
import { createEmptySave } from '../core/serialize'
import { placedBricks } from '../core/template'
import { useEditor } from './useEditor'
import { useGame } from './useGame'
import { useGuided } from './useGuided'

// A tiny template with two figures in separate steps (no shipped template has figures yet).
vi.mock('../content/templates', () => {
  const police = { torso: 21, legs: 1, face: 'smile', hat: 'police', hatColor: 0, print: 'police', accessory: 'radio' }
  const robber = { torso: 0, legs: 1, face: 'grin', hat: 'robber_cap', print: 'stripes' }
  const t = {
    id: 'figs',
    name: { vi: 'Hình', en: 'Figures' },
    difficulty: 1,
    kind: 'prop',
    tags: [],
    baseplate: { w: 8, d: 8 },
    bricks: [
      { id: 'figs-0', p: 'minifig', x: 1, y: 0, z: 1, r: 0, c: 21, fig: police },
      { id: 'figs-1', p: 'minifig', x: 4, y: 0, z: 4, r: 3, c: 0, fig: robber },
    ],
    steps: [[0], [1]],
  }
  return { TEMPLATES: [t], getTemplate: (id: string) => (id === t.id ? t : undefined) }
})

const ed = () => useEditor.getState()
const guided = () => useGame.getState().data.guided

beforeEach(() => {
  useGame.setState({ data: createEmptySave() })
  useGuided.setState({ viewStep: 0, errorSeq: 0, celebration: null })
  useEditor.setState({ partId: 'brick_1x1', color: 0, rot: 0, category: 'brick', fig: figPreset('chef') })
})

describe('guided figures', () => {
  it("shows the next figure on a tray card with its style, leaving the workshop editor's figure alone", () => {
    useGuided.getState().start('figs')
    const cards = useGuided.getState().cards()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ p: 'minifig', fig: figPreset('police') })
    expect(ed().fig).toEqual(figPreset('chef'))
  })

  it('accepts a figure at the right spot and facing whatever its style; it shows the template style', () => {
    useGuided.getState().start('figs')
    // A different style and colour still counts: the template decides how the figure looks.
    expect(useGuided.getState().tryPlace({ p: 'minifig', x: 1, y: 0, z: 1, r: 0, c: 5 })).toBe(true)
    expect(guided()!.placed).toEqual(['figs-0'])
    // The next figure's card shows its own style.
    expect(useGuided.getState().cards()[0].fig).toEqual(figPreset('robber'))
    // Facing matters for figures.
    expect(useGuided.getState().tryPlace({ p: 'minifig', x: 4, y: 0, z: 4, r: 1, c: 0 })).toBe(false)
  })

  it('placed figures are the template bricks, with their style', async () => {
    const { getTemplate } = await import('../content/templates')
    useGuided.getState().start('figs')
    useGuided.getState().tryPlace({ p: 'minifig', x: 1, y: 0, z: 1, r: 0, c: 5 })
    const placed = placedBricks(getTemplate('figs')!, guided())
    expect(placed).toHaveLength(1)
    expect(placed[0].fig).toEqual(figPreset('police'))
  })
})
