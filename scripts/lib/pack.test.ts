import { describe, expect, it } from 'vitest'
import { getTemplate } from '../../src/content/templates'
import { parseShareFile } from '../../src/core/share'
import { EXAMPLE } from './reference'
import { applyFixes, gameOptions, pack } from './pack'

describe('bt-pack', () => {
  it('packs the skill example: file, link, summary, layers, and a clean round trip', () => {
    const r = pack(EXAMPLE, { layers: true, base: 'http://localhost:5199/', now: 1 })
    expect(r.ok).toBe(true)
    expect(r.roundTrip).toEqual([])
    expect(r.link).toMatch(/^http:\/\/localhost:5199\/#s=[A-Za-z0-9_-]+$/)
    const back = parseShareFile(r.fileText!, gameOptions())
    expect('error' in back ? back.error : back.model?.blueprint.bricks.length).toBe(4)
    expect(r.report).toContain('bricks: 4 on a 8x8 baseplate')
    expect(r.report).toContain('y 0..8 (9 plates = 3 bricks tall)')
    expect(r.report).toContain('build steps: 3')
    expect(r.report).toContain('y=6 = brick course 2: 2 brick(s) start here')
    expect(r.report).toContain('..33....') // the blue 2x2 drawn with colour 3
  })

  it('reports errors per brick, writes nothing, and still draws the layers', () => {
    const r = pack({ ...EXAMPLE, bricks: [...EXAMPLE.bricks, { p: 'brick_2x2', x: 2, y: 4, z: 2, r: 0, c: 1 }] }, { layers: true })
    expect(r.ok).toBe(false)
    expect(r.fileText).toBeUndefined()
    expect(r.report).toContain('ERRORS (1)')
    expect(r.report).toContain('bricks[4]: brick #4 (brick_2x2 at x=2 y=4 z=2) collides with brick #1')
    expect(r.report).toContain('or try --fix')
    expect(r.report).toContain('!!') // the overlap shows in the layer map
  })

  it('--fix repairs and returns the repaired input to keep editing', () => {
    const raw = { ...EXAMPLE, withSteps: false, bricks: [...EXAMPLE.bricks, { ...EXAMPLE.bricks[0] }, { p: 'plate_1x1', x: 7, y: 4, z: 7, c: 1 }] }
    const r = pack(raw, { fix: true })
    expect(r.ok).toBe(true)
    expect(r.report).toContain('FIXED (2)')
    const fixed = r.fixedInput as { bricks: Array<{ y: number }> }
    expect(fixed.bricks).toHaveLength(5)
    expect(fixed.bricks[4].y).toBe(0) // the floating plate came down
    expect(pack(fixed).ok).toBe(true)
  })

  it('applyFixes renumbers explicit steps past dropped bricks', () => {
    const raw = { kind: 'model', bricks: [{}, {}, {}], steps: [[0, 1], [2]] }
    const out = applyFixes(raw, [{ where: 'bricks[1]', brick: 1, part: 'x', from: { x: 0, y: 0, z: 0 }, message: '' }]) as typeof raw
    expect(out.bricks).toHaveLength(2)
    expect(out.steps).toEqual([[0], [1]])
  })

  it('packs a city with built-in tpl: templates and an inline blueprint, and round-trips it', () => {
    const house = getTemplate('house_small')!
    const cells = Math.ceil(house.baseplate.w / 8)
    const r = pack({
      format: 'bricktown-authoring', version: 1, kind: 'city', name: 'Phố ảnh', size: 12,
      roads: Array.from({ length: 12 }, (_, x) => `${x},5`),
      rails: Array.from({ length: 12 }, (_, z) => `9,${z}`),
      terrain: { water: ['0,11', '1,11'], pavement: ['0,6', '1,6'], sand: ['2,11'] },
      blueprints: [{ id: 'kiosk', name: 'Ki-ốt', blueprintKind: 'building', baseplate: { w: 8, d: 8, c: 24 }, bricks: [{ p: 'brick_2x4', x: 2, y: 0, z: 2, c: 2 }] }],
      placements: [
        { source: 'tpl:house_small', cx: 0, cz: 0, rot: 0 },
        { source: 'kiosk', cx: cells + 1, cz: 0, rot: 1, s: 2 },
        { source: 'tpl:tree', cx: 0, cz: 7, rot: 0 },
      ],
    }, { now: 1 })
    expect(r.report).toContain('OK')
    expect(r.ok).toBe(true)
    expect(r.roundTrip).toEqual([])
    expect(r.report).toContain('placements: 3 (2 built-in templates)') // and the road/rail crossing at 9,5 is valid
  })
})
