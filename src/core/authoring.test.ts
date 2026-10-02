import { describe, expect, it } from 'vitest'
import { AUTHORING_FORMAT, MAX_AUTHORING_CHARS, authoringToPackage, parseAuthoringText, type AuthoringResult } from './authoring'
import { MAX_BRICKS } from './model'
import { decodeShare, encodeShare, shareFileText } from './share'

const header = { format: AUTHORING_FORMAT, version: 1 }

/** The 4-brick example of the skill: a red 2x4 base, a yellow 2x4 on top, a blue 2x2 and a white slope. */
const tower = () => ({
  ...header,
  kind: 'model',
  name: 'Tháp nhỏ',
  blueprintKind: 'building',
  baseplate: { w: 8, d: 8, c: 5 },
  withSteps: true,
  bricks: [
    { p: 'brick_2x4', x: 2, y: 0, z: 2, r: 0, c: 2 },
    { p: 'brick_2x4', x: 2, y: 3, z: 2, r: 0, c: 4 },
    { p: 'brick_2x2', x: 2, y: 6, z: 2, r: 0, c: 3 },
    { p: 'slope_2x2', x: 2, y: 6, z: 4, r: 0, c: 0 },
  ],
})

const templateSize = (id: string) => (id === 'house_small' ? { w: 16, d: 16 } : id === 'tree' ? { w: 8, d: 8 } : undefined)
const opts = { now: 1000, templateSize, templateIds: ['house_small', 'tree'] }

function errorsOf(r: AuthoringResult) {
  if (r.ok) throw new Error('expected errors')
  return r.errors
}

describe('authoring: models', () => {
  it('converts a valid model to a validated package with build steps', () => {
    const r = authoringToPackage(tower(), opts)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.pkg.kind).toBe('model')
    expect(r.pkg.name).toBe('Tháp nhỏ')
    const { blueprint, steps } = r.pkg.model!
    expect(blueprint.kind).toBe('building')
    expect(blueprint.baseplate).toEqual({ w: 8, d: 8, c: 5 })
    expect(blueprint.bricks.map((b) => b.p)).toEqual(['brick_2x4', 'brick_2x4', 'brick_2x2', 'slope_2x2'])
    expect(steps).toEqual([[0], [1], [2, 3]])
    expect(r.warnings).toEqual([])
  })

  it('round-trips through the share codec unchanged', () => {
    const r = authoringToPackage(tower(), opts)
    if (!r.ok) throw new Error('invalid')
    const back = decodeShare(encodeShare(r.pkg))
    expect('error' in back).toBe(false)
    if ('error' in back) return
    expect(back.model!.blueprint.bricks.map(({ p, x, y, z, r: rot, c }) => [p, x, y, z, rot, c])).toEqual(
      r.pkg.model!.blueprint.bricks.map(({ p, x, y, z, r: rot, c }) => [p, x, y, z, rot, c]),
    )
    expect(back.model!.steps).toEqual(r.pkg.model!.steps)
  })

  it('leaves steps out without withSteps and keeps figures with a preset or a style', () => {
    const r = authoringToPackage({
      ...tower(), withSteps: false,
      bricks: [
        { p: 'plate_4x4', x: 0, y: 0, z: 0, c: 7 },
        { p: 'minifig', x: 0, y: 1, z: 0, fig: 'chef' },
        { p: 'minifig', x: 2, y: 1, z: 0, fig: { torso: 3, legs: 1, face: 'smile', hat: 'cap', print: 'plain' } },
      ],
    }, opts)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.pkg.model!.steps).toBeUndefined()
    const figs = r.pkg.model!.blueprint.bricks.filter((b) => b.p === 'minifig')
    expect(figs[0].fig?.hat).toBe('chef')
    expect(figs[0].c).toBe(figs[0].fig!.torso)
    expect(figs[1].c).toBe(3)
  })

  it('accepts explicit steps (indices into the input bricks)', () => {
    const r = authoringToPackage({ ...tower(), withSteps: undefined, steps: [[0], [1], [3, 2]] }, opts)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.pkg.model!.steps).toEqual([[0], [1], [3, 2]])
  })

  it('refuses steps that need a brick of the same step for support', () => {
    const e = errorsOf(authoringToPackage({ ...tower(), withSteps: undefined, steps: [[0, 1], [2, 3]] }, opts))
    expect(e[0].code).toBe('steps')
    expect(e[0].message).toContain('brick #1')
    expect(e[0].message).toContain('unsupported')
  })
})

describe('authoring: clear errors per brick', () => {
  const withBricks = (bricks: unknown[], extra: Record<string, unknown> = {}) => authoringToPackage({ ...tower(), ...extra, bricks }, opts)

  it('unknown part id, with did-you-mean (rotated size, typo)', () => {
    const e = errorsOf(withBricks([{ p: 'brick_4x2', x: 0, y: 0, z: 0, c: 2 }, { p: 'brik_2x2', x: 4, y: 0, z: 0, c: 2 }]))
    expect(e.map((i) => i.code)).toEqual(['part_unknown', 'part_unknown'])
    expect(e[0].brick).toBe(0)
    expect(e[0].message).toContain('"brick_2x4" with r=1')
    expect(e[1].message).toContain('"brick_2x2"')
  })

  it('colour given by name or out of range', () => {
    const e = errorsOf(withBricks([{ p: 'brick_2x2', x: 0, y: 0, z: 0, c: 'red' }, { p: 'brick_2x2', x: 4, y: 0, z: 0, c: 99 }]))
    expect(e.map((i) => i.code)).toEqual(['color_unknown', 'color_unknown'])
    expect(e[0].message).toContain('use 2 (Red)')
    expect(e[1].message).toContain('0..29')
  })

  it('out of the baseplate, explaining the rotated footprint', () => {
    const e = errorsOf(withBricks([{ p: 'brick_2x4', x: 6, y: 0, z: 0, r: 1, c: 2 }]))
    expect(e[0]).toMatchObject({ code: 'out_of_bounds', brick: 0, part: 'brick_2x4', at: { x: 6, y: 0, z: 0 } })
    expect(e[0].message).toContain('x must be at most 4')
    expect(e[0].message).toContain('4x2')
  })

  it('collision names the other brick and spots y counted in bricks', () => {
    const e = errorsOf(withBricks([{ p: 'brick_2x4', x: 0, y: 0, z: 0, c: 2 }, { p: 'brick_2x4', x: 0, y: 1, z: 0, c: 4 }]))
    expect(e[0]).toMatchObject({ code: 'collision', brick: 1, other: 0 })
    expect(e[0].message).toContain('starts at y=3')
  })

  it('floating brick says where the support is', () => {
    const e = errorsOf(withBricks([{ p: 'brick_2x4', x: 0, y: 0, z: 0, c: 2 }, { p: 'brick_2x2', x: 0, y: 5, z: 0, c: 4 }, { p: 'plate_1x1', x: 7, y: 2, z: 7, c: 1 }]))
    expect(e.map((i) => [i.code, i.brick])).toEqual([['unsupported', 2], ['unsupported', 1]])
    expect(e[1].message).toContain('set y=3')
    expect(e[0].message).toContain('set y=0')
  })

  it('invalid figure style, fig on a normal brick, bad rotation and coordinates', () => {
    const e = errorsOf(withBricks([
      { p: 'minifig', x: 0, y: 0, z: 0, fig: { torso: 3, legs: 1, face: 'happy', hat: 'none', print: 'plain' } },
      { p: 'brick_1x1', x: 4, y: 0, z: 0, c: 1, fig: 'chef' },
      { p: 'brick_1x1', x: 5, y: 0, z: 0, c: 1, r: 4 },
      { p: 'brick_1x1', x: 6.5, y: 0, z: 0, c: 1 },
    ]))
    expect(e.map((i) => i.code)).toEqual(['fig', 'fig_not_minifig', 'rot', 'coord'])
    expect(e[0].message).toContain('face must be one of')
  })

  it('brick limit and height limit', () => {
    const many = Array.from({ length: MAX_BRICKS + 1 }, (_, i) => ({ p: 'plate_1x1', x: i % 48, y: Math.floor(i / 48), z: 0, c: 1 }))
    expect(errorsOf(authoringToPackage({ ...tower(), baseplate: { w: 48, d: 8 }, bricks: many }, opts))[0].code).toBe('limit')
    const tall = Array.from({ length: 49 }, (_, i) => ({ p: 'brick_1x1', x: 0, y: i * 3, z: 0, c: 1 }))
    const e = errorsOf(withBricks(tall))
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ code: 'too_high', brick: 48 })
  })

  it('wrong field names and kinds get a hint', () => {
    expect(errorsOf(withBricks([{ part: 'brick_1x1', x: 0, y: 0, z: 0, color: 1 }]))[0].message).toContain('use "p" instead of "part"')
    expect(errorsOf(authoringToPackage({ ...tower(), kind: 'building' }, opts))[0].message).toContain('blueprintKind')
    expect(errorsOf(authoringToPackage({ ...tower(), version: 2 }, opts))[0].code).toBe('version')
  })
})

describe('authoring: --fix safe repairs', () => {
  const fixed = (bricks: unknown[]) => authoringToPackage({ ...tower(), withSteps: false, bricks }, { ...opts, fix: true })

  it('drops an exact duplicate', () => {
    const r = fixed([{ p: 'brick_2x4', x: 0, y: 0, z: 0, c: 2 }, { p: 'brick_2x4', x: 0, y: 0, z: 0, c: 2 }])
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.pkg.model!.blueprint.bricks).toHaveLength(1)
    expect(r.fixes).toHaveLength(1)
    expect(r.fixes[0]).toMatchObject({ brick: 1, part: 'brick_2x4' })
    expect(r.fixes[0].to).toBeUndefined()
    expect(r.fixes[0].message).toContain('duplicate of brick #0')
  })

  it('lifts a brick whose y was counted in bricks onto the brick below', () => {
    const r = fixed([{ p: 'brick_2x4', x: 0, y: 0, z: 0, c: 2 }, { p: 'brick_2x4', x: 0, y: 1, z: 0, c: 4 }])
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.fixes[0]).toMatchObject({ brick: 1, from: { y: 1 }, to: { y: 3 } })
    expect(r.pkg.model!.blueprint.bricks.map((b) => b.y)).toEqual([0, 3])
  })

  it('lowers a floating brick onto the nearest support', () => {
    const r = fixed([{ p: 'brick_2x4', x: 0, y: 0, z: 0, c: 2 }, { p: 'brick_2x2', x: 0, y: 5, z: 0, c: 4 }])
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.fixes[0]).toMatchObject({ brick: 1, from: { y: 5 }, to: { y: 3 } })
  })

  it('leaves an ambiguous or far brick alone (still an error)', () => {
    const e = errorsOf(fixed([{ p: 'brick_2x4', x: 0, y: 0, z: 0, c: 2 }, { p: 'brick_2x2', x: 0, y: 30, z: 0, c: 4 }]))
    expect(e[0]).toMatchObject({ code: 'unsupported', brick: 1 })
  })

  it('drops a brick overlapping another at its own level (never pushes good bricks around)', () => {
    const r = fixed([
      { p: 'brick_2x4', x: 0, y: 0, z: 0, c: 2 },
      { p: 'brick_2x4', x: 0, y: 3, z: 0, c: 2 },
      { p: 'brick_2x4', x: 0, y: 6, z: 0, c: 2 },
      { p: 'brick_2x2', x: 1, y: 3, z: 1, c: 4 }, // overlaps brick #1 at the same level
    ])
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.fixes.map((f) => [f.brick, f.to?.y])).toEqual([[3, undefined]])
    expect(r.pkg.model!.blueprint.bricks.map((b) => b.y)).toEqual([0, 3, 6])
  })

  it('repairs a whole stack written with y in bricks (0, 1, 2)', () => {
    const r = fixed([0, 1, 2].map((y) => ({ p: 'brick_2x4', x: 0, y, z: 0, c: 2 })))
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.pkg.model!.blueprint.bricks.map((b) => b.y)).toEqual([0, 3, 6])
    expect(r.fixes).toHaveLength(2)
  })

  it('nudges a brick that sticks out of the plate back inside (a 1x6 along z at z=12 on a 16-deep plate)', () => {
    const ok = authoringToPackage({
      ...tower(), withSteps: false, baseplate: { w: 16, d: 16, c: 5 },
      bricks: [{ p: 'brick_1x6', x: 4, y: 0, z: 12, c: 2 }, { p: 'brick_2x4', x: 14, y: 0, z: 4, r: 1, c: 3 }],
    }, { ...opts, fix: true })
    if (!ok.ok) throw new Error(JSON.stringify(ok.errors))
    expect(ok.fixes.map((f) => [f.brick, f.from.x, f.from.z, f.to?.x, f.to?.z])).toEqual([[0, 4, 12, 4, 10], [1, 14, 4, 12, 4]])
    expect(ok.fixes[0].message).toContain('moved to x=4, z=10')
    expect(ok.pkg.model!.blueprint.bricks.map((b) => [b.x, b.z]).sort((a, b) => a[0] - b[0])).toEqual([[4, 10], [12, 4]])
  })

  it('does not nudge when the shifted spot is taken, or when it sticks out by more than 3 studs', () => {
    const base = { ...tower(), withSteps: false, baseplate: { w: 16, d: 16, c: 5 } }
    const taken = authoringToPackage({ ...base, bricks: [{ p: 'brick_1x6', x: 4, y: 0, z: 10, c: 2 }, { p: 'brick_1x6', x: 4, y: 0, z: 12, c: 4 }] }, { ...opts, fix: true })
    expect(errorsOf(taken)[0]).toMatchObject({ code: 'out_of_bounds', brick: 1 })
    // the shifted spot (z=10) would float: nothing under it
    const floating = authoringToPackage({ ...base, bricks: [{ p: 'brick_2x4', x: 4, y: 0, z: 0, c: 2 }, { p: 'brick_1x6', x: 4, y: 3, z: 13, c: 4 }] }, { ...opts, fix: true })
    expect(errorsOf(floating)[0]).toMatchObject({ code: 'out_of_bounds', brick: 1 })
    const far = authoringToPackage({ ...base, bricks: [{ p: 'brick_1x6', x: 4, y: 0, z: 14, c: 2 }] }, { ...opts, fix: true })
    expect(errorsOf(far)[0]).toMatchObject({ code: 'out_of_bounds', brick: 0 })
    const plain = authoringToPackage({ ...base, bricks: [{ p: 'brick_1x6', x: 4, y: 0, z: 12, c: 2 }] }, opts)
    expect(errorsOf(plain)[0]).toMatchObject({ code: 'out_of_bounds', brick: 0 })
  })
})

describe('authoring: cities', () => {
  const city = () => ({
    ...header,
    kind: 'city',
    name: 'Phố nhỏ',
    size: 8,
    roads: ['0,3', '1,3', '2,3', '3,3', '4,3', '5,3', '6,3', '7,3'],
    rails: ['5,0', '5,1', '5,2', '5,3', '5,4', '5,5', '5,6', '5,7'],
    terrain: { water: ['7,7'], pavement: ['0,4', '1,4'], sand: [] },
    blueprints: [{ id: 'kiosk', name: 'Kiosk', blueprintKind: 'building', baseplate: { w: 8, d: 8 }, bricks: [{ p: 'brick_2x2', x: 0, y: 0, z: 0, c: 2 }] }],
    placements: [
      { source: 'tpl:house_small', cx: 0, cz: 0, rot: 0 },
      { source: 'kiosk', cx: 3, cz: 0, rot: 1 },
      { source: 'tpl:tree', cx: 0, cz: 5, rot: 0, s: 2 },
    ],
  })

  it('packs a city with tpl: references and inline blueprints', () => {
    const r = authoringToPackage(city(), opts)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    const c = r.pkg.city!
    expect(c.city.placements.map((p) => [p.source, p.cx, p.cz, p.rot, p.s])).toEqual([
      ['tpl:house_small', 0, 0, 0, undefined], ['kiosk', 3, 0, 1, undefined], ['tpl:tree', 0, 5, 0, 2],
    ])
    expect(c.blueprints.map((b) => b.id)).toEqual(['kiosk'])
    expect(c.city.rails).toHaveLength(8)
    expect(c.city.terrain?.water).toEqual(['7,7'])
    const back = decodeShare(encodeShare(r.pkg), { templateSize })
    expect('error' in back).toBe(false)
  })

  it('explains placement problems: road, overlap, unknown template, unknown blueprint', () => {
    const bad = city()
    bad.placements = [
      { source: 'tpl:house_small', cx: 0, cz: 2, rot: 0 },
      { source: 'tpl:house_smal', cx: 6, cz: 6, rot: 0 },
      { source: 'kiosc', cx: 6, cz: 6, rot: 0 },
      { source: 'tpl:tree', cx: 0, cz: 0, rot: 0 },
      { source: 'tpl:tree', cx: 0, cz: 0, rot: 0 },
    ]
    const e = errorsOf(authoringToPackage(bad, opts))
    expect(e.map((i) => i.code)).toEqual(['placement', 'template_unknown', 'source_unknown', 'placement'])
    expect(e[0].message).toContain('road cell(s) 0,3 1,3')
    expect(e[1].message).toContain('"tpl:house_small"')
    expect(e[2].message).toContain('"kiosk"')
    expect(e[3].message).toContain('overlaps placements[3]')
  })

  it('refuses water under a road and bad crossings', () => {
    const bad = city()
    bad.terrain.water = ['2,3']
    bad.rails = ['3,2', '3,3', '4,3']
    const codes = errorsOf(authoringToPackage(bad, opts)).map((i) => i.code)
    expect(codes).toContain('terrain')
    expect(codes).toContain('crossing')
  })
})

describe('authoring: mazes', () => {
  it('packs a playable maze grid', () => {
    const r = authoringToPackage({
      ...header, kind: 'maze', name: 'Mê cung',
      grid: ['#######', 'E.....#', '#.###.#', '#..o#.#', '#.###.#', '#.....X', '#######'],
    }, opts)
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.pkg.maze!.maze.entry).toEqual({ cx: 0, cz: 1 })
    expect(r.pkg.maze!.maze.coins).toEqual(['3,3'])
  })

  it('refuses a maze without a way out', () => {
    const e = errorsOf(authoringToPackage({ ...header, kind: 'maze', grid: ['#######', 'E..#..#', '#..#..#', '#..#..#', '#..#..#', '#..#..X', '#######'] }, opts))
    expect(e[0].message).toContain('no path')
  })
})

describe('parseAuthoringText: what the 📥 import sees', () => {
  it('ignores share files and links', () => {
    const r = authoringToPackage(tower(), opts)
    if (!r.ok) throw new Error('invalid')
    expect(parseAuthoringText(shareFileText(r.pkg))).toBeNull()
    expect(parseAuthoringText('http://localhost:5173/#s=abc')).toBeNull()
    expect(parseAuthoringText('{"kind":"model"}')).toBeNull() // no marker
  })

  it('reads a reply wrapped in a ```json fence with text around it', () => {
    const text = `Here it is:\n\`\`\`json\n${JSON.stringify(tower(), null, 2)}\n\`\`\`\nA small tower.`
    const r = parseAuthoringText(text, opts)
    expect(r?.ok).toBe(true)
  })

  it('refuses oversized text before parsing, and broken JSON', () => {
    const huge = `{"format":"${AUTHORING_FORMAT}","name":"${'x'.repeat(MAX_AUTHORING_CHARS)}"}`
    const r = parseAuthoringText(huge)
    expect(r && !r.ok && r.errors[0].code).toBe('too_big')
    const broken = parseAuthoringText(`{"format":"${AUTHORING_FORMAT}", "kind": }`)
    expect(broken && !broken.ok && broken.errors[0].code).toBe('json')
  })

  it('rejects malicious authoring JSON', () => {
    const evil = [
      { ...tower(), bricks: [{ p: '__proto__', x: 0, y: 0, z: 0, c: 1 }] },
      { ...tower(), bricks: [{ p: 'toString', x: 0, y: 0, z: 0, c: 1 }] },
      { ...tower(), bricks: [{ p: 'brick_1x1', x: 1e9, y: 0, z: 0, c: 1 }] },
      { ...tower(), bricks: [{ p: 'brick_1x1', x: 0, y: -3, z: 0, c: 1 }] },
      { ...tower(), bricks: [{ p: 'brick_1x1', x: 0, y: 0, z: 0, c: 'constructor' }] },
      { ...tower(), baseplate: { w: 10_000, d: 8 } },
      { ...tower(), bricks: 'lots' },
      { ...tower(), kind: '__proto__' },
      { ...tower(), withSteps: undefined, steps: [[0, 0, 1, 2, 3]] },
      { ...header, kind: 'city', size: 1e6, placements: [] },
      { ...header, kind: 'city', size: 8, roads: ['999,999'], placements: [] },
      { ...header, kind: 'city', size: 8, placements: [{ source: 'tpl:../../etc', cx: 0, cz: 0 }] },
    ]
    for (const raw of evil) {
      const r = parseAuthoringText(JSON.stringify(raw), opts)
      expect(r?.ok, JSON.stringify(raw).slice(0, 120)).toBe(false)
    }
    // A name with hidden characters is cleaned, never refused for it.
    const r = parseAuthoringText(JSON.stringify({ ...tower(), name: 'Nhà‮abc\u0000' }), opts)
    expect(r?.ok && r.pkg.name).toBe('Nhàabc')
  })
})
