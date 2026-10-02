import { describe, expect, it } from 'vitest'
import { figPreset } from './figures'
import { DEFAULT_MAZE_WALL_COLOR, createEmptyMaze, setEntry, setExit, toggleCoin, toggleWall, type Maze } from './maze'
import { SCHEMA_VERSION, createEmptySave, exportSave, importSave, migrate } from './serialize'
import { buildMazePackage, decodeShare, encodeShare, isShareError } from './share'
import { applyImport, planImport } from './shareImport'

describe('serialize', () => {
  it('createEmptySave has the spec defaults', () => {
    expect(createEmptySave()).toEqual({
      schemaVersion: SCHEMA_VERSION,
      blueprints: [],
      city: { size: 48, roads: [], placements: [] },
      workshop: { kind: 'building', baseplate: { w: 16, d: 16 }, bricks: [] },
      guided: null,
      completedTemplates: [],
      sharedTemplates: [],
      mazes: [],
      mazeRecords: {},
      mazeChallenges: {},
    })
  })
  it('export -> import round-trips deep-equal', () => {
    const save = createEmptySave()
    save.workshop.bricks.push({ id: 'a', p: 'brick_2x4', x: 1, y: 0, z: 2, r: 1, c: 3 })
    save.completedTemplates.push('house')
    const json = exportSave(save)
    expect(JSON.parse(json).app).toBe('bricktown')
    expect(importSave(json)).toEqual(save)
  })
  it('importSave rejects wrong app and invalid JSON', () => {
    const save = createEmptySave()
    expect(() => importSave(JSON.stringify({ app: 'other', ...save }))).toThrow()
    expect(() => importSave(JSON.stringify(save))).toThrow()
    expect(() => importSave('not json')).toThrow()
  })
  it('rejects newer or invalid versions', () => {
    const save = createEmptySave()
    expect(() => migrate({ ...save, schemaVersion: SCHEMA_VERSION + 1 })).toThrow('unsupported save')
    expect(() => migrate({ ...save, schemaVersion: 0 })).toThrow('unsupported save')
    expect(() => migrate({ ...save, schemaVersion: 'x' })).toThrow('unsupported save')
    expect(() => migrate(null)).toThrow('unsupported save')
    expect(() => migrate([])).toThrow('unsupported save')
  })
  it('rejects saves missing blueprints, city or workshop', () => {
    for (const key of ['blueprints', 'city', 'workshop'] as const) {
      const partial: Record<string, unknown> = { ...createEmptySave() }
      delete partial[key]
      expect(() => migrate(partial)).toThrow('unsupported save')
      expect(() => importSave(JSON.stringify({ app: 'bricktown', ...partial }))).toThrow('unsupported save')
    }
  })
  it('fills in missing optional parts of a save with the defaults', () => {
    const out = migrate({ schemaVersion: SCHEMA_VERSION, blueprints: [], city: {}, workshop: {} })
    expect(out).toEqual(createEmptySave())
  })
  it('replaces malformed fields with defaults and keeps the valid ones', () => {
    const brick = { id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 1 }
    const out = migrate({
      schemaVersion: SCHEMA_VERSION,
      blueprints: [],
      city: { size: 'big', roads: 'nope', placements: [{ id: 'p', source: 'tpl:tree', cx: 1, cz: 2, rot: 0 }] },
      workshop: { kind: 'spaceship', baseplate: { w: 8 }, bricks: [brick], editingBlueprintId: 7 },
      guided: { templateId: 'house_small' }, // incomplete
      completedTemplates: ['tree', 3],
    })
    expect(out.city).toEqual({ size: 48, roads: [], placements: [{ id: 'p', source: 'tpl:tree', cx: 1, cz: 2, rot: 0 }] })
    expect(out.workshop).toEqual({ kind: 'building', baseplate: { w: 16, d: 16 }, bricks: [brick] })
    expect(out.guided).toBeNull()
    expect(out.completedTemplates).toEqual(['tree'])
  })
  it('keeps a valid guided build and editing id', () => {
    const save = createEmptySave()
    save.guided = { templateId: 'tree', step: 2, placed: ['a'] }
    save.workshop.editingBlueprintId = 'bp1'
    expect(migrate(save)).toEqual(save)
  })
  it('migrate accepts current version', () => {
    const save = createEmptySave()
    expect(migrate(save)).toEqual(save)
  })
  it('is schema version 3', () => {
    expect(SCHEMA_VERSION).toBe(3)
  })
  it('loads a v1 save unchanged apart from the version', () => {
    const brick = { id: 'a', p: 'brick_2x4', x: 1, y: 0, z: 2, r: 1 as const, c: 15 }
    const v1 = {
      schemaVersion: 1,
      blueprints: [
        {
          id: 'bp1', name: 'Nhà', kind: 'building', tags: [], baseplate: { w: 16, d: 16 },
          bricks: [brick], createdAt: 1, updatedAt: 2,
        },
      ],
      city: { size: 48, roads: ['1,2'], placements: [{ id: 'p', source: 'bp1', cx: 0, cz: 0, rot: 0 }] },
      workshop: { kind: 'vehicle', baseplate: { w: 8, d: 16 }, bricks: [brick], editingBlueprintId: 'bp1' },
      guided: { templateId: 'tree', step: 1, placed: ['t1'] },
      completedTemplates: ['tree'],
    }
    const json = JSON.stringify({ app: 'bricktown', ...v1 })
    const v3 = { ...v1, schemaVersion: 3, sharedTemplates: [], mazes: [], mazeRecords: {}, mazeChallenges: {} }
    expect(importSave(json)).toEqual(v3)
    expect(migrate(structuredClone(v1))).toEqual(v3)
  })
  it('round-trips a v2 save with plate colours and the new colours', () => {
    const save = createEmptySave()
    save.workshop.baseplate = { w: 24, d: 16, c: 24 }
    save.workshop.bricks.push(
      { id: 'a', p: 'brick_1x1', x: 0, y: 0, z: 0, r: 0, c: 16 },
      { id: 'b', p: 'brick_1x1', x: 1, y: 0, z: 0, r: 0, c: 29 },
    )
    save.blueprints.push({
      id: 'bp', name: 'x', kind: 'prop', tags: [], baseplate: { w: 8, d: 8, c: 3 },
      bricks: [{ id: 'c', p: 'plate_2x2', x: 0, y: 0, z: 0, r: 0, c: 28 }], createdAt: 1, updatedAt: 1,
    })
    expect(importSave(exportSave(save))).toEqual(save)
  })
  it('keeps a valid workshop plate colour and drops one that is not a colour', () => {
    const base = { schemaVersion: SCHEMA_VERSION, blueprints: [], city: {} }
    expect(migrate({ ...base, workshop: { baseplate: { w: 8, d: 8, c: 10 } } }).workshop.baseplate).toEqual({ w: 8, d: 8, c: 10 })
    expect(migrate({ ...base, workshop: { baseplate: { w: 8, d: 8, c: 99 } } }).workshop.baseplate).toEqual({ w: 8, d: 8 })
    expect(migrate({ ...base, workshop: { baseplate: { w: 8, d: 8, c: 'red' } } }).workshop.baseplate).toEqual({ w: 8, d: 8 })
  })
  it('round-trips figures with their style (an additive field)', () => {
    const save = createEmptySave()
    save.workshop.bricks.push({ id: 'f', p: 'minifig', x: 0, y: 0, z: 0, r: 2, c: 21, fig: figPreset('police') })
    save.blueprints.push({
      id: 'bp', name: 'x', kind: 'building', tags: [], baseplate: { w: 8, d: 8 },
      bricks: [{ id: 'g', p: 'minifig', x: 2, y: 0, z: 2, r: 0, c: 0, fig: { ...figPreset('robber'), arms: 1 } }],
      createdAt: 1, updatedAt: 1,
    })
    expect(importSave(exportSave(save))).toEqual(save)
  })
  it('drops figure styles it cannot read, keeping the bricks', () => {
    const fig = (extra: object) => ({ id: 'f', p: 'minifig', x: 0, y: 0, z: 0, r: 0, c: 0, ...extra })
    const out = migrate({
      schemaVersion: SCHEMA_VERSION,
      blueprints: [
        { id: 'bp', name: 'x', kind: 'building', tags: [], baseplate: { w: 8, d: 8 }, createdAt: 1, updatedAt: 1, bricks: [fig({ fig: { torso: 'red' } })] },
      ],
      city: {},
      workshop: { bricks: [fig({ fig: 'police' }), fig({ fig: { ...figPreset('chef'), accessory: 'sword' } }), fig({})] },
    })
    const { accessory: _a, ...chef } = figPreset('chef')
    void _a
    expect(out.workshop.bricks).toEqual([fig({}), fig({ fig: chef }), fig({})])
    expect(out.blueprints[0].bricks).toEqual([fig({})])
  })
  it('keeps a figure style only on minifigure bricks', () => {
    const brick = { id: 'b', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 0 }
    const out = migrate({
      schemaVersion: SCHEMA_VERSION, blueprints: [], city: {},
      workshop: { bricks: [{ ...brick, fig: figPreset('chef') }] },
    })
    expect(out.workshop.bricks).toEqual([brick])
  })

  describe('placement sizes (CityPlacement.s)', () => {
    const pl = (extra: Record<string, unknown> = {}) => ({ id: 'p', source: 'tpl:tree', cx: 1, cz: 2, rot: 0, ...extra })
    const load = (...placements: unknown[]) =>
      migrate({ schemaVersion: SCHEMA_VERSION, blueprints: [], city: { size: 48, roads: [], placements }, workshop: {} }).city.placements

    it('loads an old save without sizes unchanged', () => {
      expect(load(pl(), pl({ id: 'q', rot: 3 }))).toEqual([pl(), pl({ id: 'q', rot: 3 })])
    })
    it('round-trips a scaled placement', () => {
      const save = createEmptySave()
      save.city.placements = [pl({ s: 4 }) as never, pl({ id: 'q', cx: 9 }) as never]
      expect(importSave(exportSave(save))).toEqual(save)
    })
    it('rounds and clamps sizes into 1..10, garbage becomes x1 (the field is dropped)', () => {
      expect(load(pl({ s: 2.6 }), pl({ s: 0 }), pl({ s: -3 }), pl({ s: 99 }), pl({ s: 10 }), pl({ s: 1 }))).toEqual([
        pl({ s: 3 }), pl(), pl(), pl({ s: 10 }), pl({ s: 10 }), pl(),
      ])
      expect(load(pl({ s: 'big' }), pl({ s: NaN }), pl({ s: null }), pl({ s: Infinity }), pl({ s: [3] }))).toEqual([pl(), pl(), pl(), pl(), pl()])
    })
  })

  describe('sharing fields', () => {
    const base = { schemaVersion: SCHEMA_VERSION, blueprints: [], city: {}, workshop: {} }
    const template = {
      id: 'shared_1', name: { vi: 'Xe', en: 'Xe' }, difficulty: 1, kind: 'vehicle', tags: [], baseplate: { w: 8, d: 8 },
      bricks: [{ id: 'shared_1-0', p: 'minifig', x: 0, y: 0, z: 0, r: 0, c: 0, fig: figPreset('chef') }], steps: [[0]],
    }
    it('fills in the defaults for a save without them', () => {
      const out = migrate(base)
      expect(out.sharedTemplates).toEqual([])
      expect(out.mazes).toEqual([])
      expect(out.mazeChallenges).toEqual({})
    })
    it('round-trips shared templates, mazes and challenges', () => {
      const save = createEmptySave()
      save.sharedTemplates = [template as never]
      save.mazes = [createEmptyMaze(7, 7, { id: 'maze_1', name: 'm', now: 1 })]
      save.mazeChallenges = { maze_1: { timeMs: 4200 }, maze_2: { timeMs: 900, from: 'An' } }
      expect(importSave(exportSave(save))).toEqual(save)
    })
    it('drops malformed shared templates, mazes and challenges', () => {
      const out = migrate({
        ...base,
        sharedTemplates: [
          template, { id: 'x' }, null, { ...template, bricks: [{ ...template.bricks[0], fig: 'chef' }] },
          { ...template, id: 'no_steps', steps: [] }, // a brick in no step: Guided could never finish it
          { ...template, id: 'floating', bricks: [{ ...template.bricks[0], y: 5 }] },
          { ...template, id: 'odd_steps', steps: [5] }, // a shape validateTemplate does not expect
          { ...template, id: 'huge_plate', baseplate: { w: 4096, d: 16 } }, // bigger than any plate
          { ...template, id: 'zero_plate', baseplate: { w: 0, d: 16 } },
        ],
        mazes: [{ id: 'm' }, 'maze', null],
        mazeChallenges: {
          a: { timeMs: 10 }, b: { timeMs: -1 }, c: 'fast', d: { timeMs: 5, from: 7 }, e: { timeMs: NaN },
          constructor: { timeMs: 3 },
        },
      })
      const { fig: _fig, ...plain } = template.bricks[0]
      void _fig
      expect(out.sharedTemplates).toEqual([template, { ...template, bricks: [plain] }])
      expect(out.mazes).toEqual([]) // no size: not a maze
      expect(out.mazeChallenges).toEqual({ a: { timeMs: 10 }, d: { timeMs: 5 } })
      expect(migrate({ ...base, sharedTemplates: 'x', mazes: {}, mazeChallenges: [] })).toMatchObject({ sharedTemplates: [], mazes: [], mazeChallenges: {} })
    })
  })
})

describe('serialize: mazes (schema 3)', () => {
  /** A valid 7x7 maze: solid outer ring with an entry on the west edge, an exit on the east edge, one wall and one coin inside. */
  function maze(extra: Partial<Maze> = {}): Maze {
    let m = createEmptyMaze(7, 7, { id: 'm1', name: 'Mê cung 1', now: 5 })
    m = toggleWall(m, { cx: 2, cz: 2 }, true)
    m = toggleCoin(m, { cx: 3, cz: 3 })
    const a = setEntry(m, { cx: 0, cz: 1 })
    if ('error' in a) throw new Error(a.error)
    const b = setExit(a.maze, { cx: 6, cz: 5 })
    if ('error' in b) throw new Error(b.error)
    return { ...b.maze, ...extra }
  }
  const ring = (w: number, h: number) => {
    const out: string[] = []
    for (let cz = 0; cz < h; cz++) for (let cx = 0; cx < w; cx++) if (cx === 0 || cz === 0 || cx === w - 1 || cz === h - 1) out.push(`${cx},${cz}`)
    return out
  }

  it('loads a v2 save without mazes, adding empty maze fields', () => {
    const v2: Record<string, unknown> = { ...createEmptySave(), schemaVersion: 2 }
    for (const k of ['sharedTemplates', 'mazes', 'mazeRecords', 'mazeChallenges']) delete v2[k]
    const out = migrate(structuredClone(v2))
    expect(out.schemaVersion).toBe(3)
    expect(out).toMatchObject({ sharedTemplates: [], mazes: [], mazeRecords: {}, mazeChallenges: {} })
    expect(importSave(JSON.stringify({ app: 'bricktown', ...v2 }))).toEqual(createEmptySave())
  })

  it('keeps what a late v2 save already had (shared mazes, challenges) through the migration', () => {
    const v2 = { ...createEmptySave(), schemaVersion: 2, mazes: [maze({ id: 'shared' })], mazeChallenges: { shared: { timeMs: 5000, from: 'An' } } }
    const { mazeRecords: _r, ...withoutRecords } = v2
    void _r
    const out = migrate(structuredClone(withoutRecords))
    expect(out.mazes).toEqual([maze({ id: 'shared' })])
    expect(out.mazeChallenges).toEqual({ shared: { timeMs: 5000, from: 'An' } })
    expect(out.mazeRecords).toEqual({})
  })

  it('round-trips mazes and records', () => {
    const save = createEmptySave()
    const { floorColor: _f, ...noFloor } = maze({ id: 'm2', templateId: 'heart', wallColor: 29 })
    void _f
    save.mazes.push(maze(), noFloor)
    save.mazeRecords = { m1: { timeMs: 12345, stars: 3, coins: 2 }, 'tpl:easy': { timeMs: 900, stars: 1, coins: 0 } }
    expect(importSave(exportSave(save))).toEqual(save)
  })

  it('a maze imported from a share link survives a save and a reload', () => {
    const save = createEmptySave()
    const pkg = decodeShare(encodeShare(buildMazePackage(maze({ id: 'theirs', name: 'Của bạn' }), { timeMs: 9000, stars: 3 })))
    if (isShareError(pkg)) throw new Error(pkg.error)
    const plan = planImport(save, pkg)
    const imported = applyImport(save, plan)
    expect(imported.mazes).toHaveLength(1)
    const reloaded = importSave(exportSave(imported))
    expect(reloaded.mazes).toEqual(imported.mazes)
    expect(reloaded.mazeChallenges).toEqual(imported.mazeChallenges)
    expect(reloaded.mazeRecords).toEqual({})
  })

  it('drops mazes it cannot use and cleans up the fields of the rest', () => {
    const out = migrate({
      ...createEmptySave(),
      mazes: [
        maze(),
        'nope',
        { ...maze({ id: 'even' }), w: 8 },
        { ...maze({ id: 'big' }), h: 23 },
        maze({ id: '' }),
        maze({ id: 'm1', name: 'duplicate' }),
        {
          ...maze({ id: 'm3' }),
          name: 7,
          walls: ['0,0', 'x', '9,9', 3, '-1,2', '1.5,2', '0,0', '2,2'],
          coins: ['3,3', '99,1', '2,2'],
          entry: { cx: 'a', cz: 1 },
          exit: { cx: 6, cz: 40 },
          wallColor: 99,
          floorColor: 'red',
          createdAt: 'yesterday',
          templateId: 4,
        },
      ],
    })
    expect(out.mazes.map((m) => m.id)).toEqual(['m1', 'm3'])
    expect(out.mazes[0]).toEqual(maze())
    const m3 = out.mazes[1]
    expect(m3).toMatchObject({ name: '', coins: ['3,3'], entry: null, exit: null, wallColor: DEFAULT_MAZE_WALL_COLOR, createdAt: 0, updatedAt: 5 })
    expect(new Set(m3.walls)).toEqual(new Set([...ring(7, 7), '2,2'])) // the door gaps are walled up again
    expect(m3.walls).toHaveLength(new Set(m3.walls).size)
    expect('floorColor' in m3).toBe(false)
    expect('templateId' in m3).toBe(false)
  })

  it('gives a kid’s maze stored under a ready-made maze id (tpl:…) a fresh id, so it never shares that record', () => {
    const out = migrate({
      ...createEmptySave(),
      mazes: [maze({ id: 'tpl:easy' }), maze({ id: 'm2' })],
      mazeRecords: { 'tpl:easy': { timeMs: 900, stars: 1, coins: 0 } },
    })
    expect(out.mazes).toHaveLength(2)
    const [renamed, kept] = out.mazes
    expect(renamed.id).toMatch(/^maze_/)
    expect(renamed).toEqual({ ...maze(), id: renamed.id })
    expect(kept.id).toBe('m2')
    expect(out.mazeRecords).toEqual({ 'tpl:easy': { timeMs: 900, stars: 1, coins: 0 } }) // still the template's
  })

  it('drops doors that break the maze rules, walling their gap', () => {
    const doorsAt = (entry: object | null, exit: object | null, extra: Partial<Maze> = {}) =>
      migrate({ ...createEmptySave(), mazes: [{ ...maze(), ...extra, entry, exit }] }).mazes[0]
    expect(doorsAt({ cx: 0, cz: 0 }, { cx: 6, cz: 5 }).entry).toBeNull() // corner
    expect(doorsAt({ cx: 3, cz: 3 }, { cx: 6, cz: 5 }).entry).toBeNull() // inside
    const same = doorsAt({ cx: 0, cz: 1 }, { cx: 0, cz: 1 })
    expect(same.entry).toEqual({ cx: 0, cz: 1 })
    expect(same.exit).toBeNull() // the same cell as the entry
    expect(same.walls).toContain('6,5') // the old exit gap is wall again
    const onWall = doorsAt({ cx: 0, cz: 1 }, { cx: 6, cz: 3 }) // (6,3) is part of the solid ring
    expect(onWall.exit).toBeNull()
    expect(onWall.walls).toContain('6,5')
    const coinOnDoor = doorsAt({ cx: 0, cz: 1 }, { cx: 6, cz: 5 }, { coins: ['0,1', '3,3'] })
    expect(coinOnDoor.coins).toEqual(['3,3'])
  })

  it('keeps only well-formed records, never prototype keys', () => {
    const raw = JSON.parse(
      '{"ok":{"timeMs":1000,"stars":2,"coins":1},"badStars":{"timeMs":1000,"stars":4,"coins":1},' +
        '"badTime":{"timeMs":-1,"stars":1,"coins":0},"badCoins":{"timeMs":1,"stars":1,"coins":1.5},"notObject":5,' +
        '"__proto__":{"timeMs":1,"stars":1,"coins":0},"constructor":{"timeMs":1,"stars":1,"coins":0}}',
    )
    const out = migrate({ ...createEmptySave(), mazeRecords: raw })
    expect(out.mazeRecords).toEqual({ ok: { timeMs: 1000, stars: 2, coins: 1 } })
    expect(Object.keys(out.mazeRecords)).toEqual(['ok'])
    expect(migrate({ ...createEmptySave(), mazeRecords: [] }).mazeRecords).toEqual({})
    expect(migrate({ ...createEmptySave(), mazes: {} }).mazes).toEqual([])
  })
})

describe('serialize: city terrain and rails (optional, v3)', () => {
  const load = (city: Record<string, unknown>) =>
    migrate({ schemaVersion: SCHEMA_VERSION, blueprints: [], city: { size: 10, roads: [], placements: [], ...city }, workshop: {} }).city

  it('loads an old city without them unchanged (no fields added)', () => {
    expect(load({ roads: ['1,1'] })).toEqual({ size: 10, roads: ['1,1'], placements: [] })
  })
  it('round-trips terrain and rails', () => {
    const save = createEmptySave()
    save.city = { ...save.city, roads: ['4,0', '4,1', '4,2'], rails: ['3,1', '4,1', '5,1'], terrain: { water: ['9,9'], pavement: ['0,0'], sand: ['1,0'] } }
    expect(importSave(exportSave(save))).toEqual(save)
  })
  it('keeps only valid cells, one kind per cell, no water under roads or rails; empty layers are dropped', () => {
    const city = load({
      roads: ['2,2'],
      rails: ['3,3', '3,3', '10,0', 'x', 7, '3,4'],
      terrain: { water: ['2,2', '3,3', '5,5', '5,5', '-1,2'], pavement: ['5,5', '6,6'], sand: 'nope', extra: ['7,7'] },
    })
    expect(city.rails).toEqual(['3,3', '3,4'])
    expect(city.terrain).toEqual({ water: ['5,5'], pavement: ['6,6'], sand: [] })
    const empty = load({ rails: [], terrain: { water: ['99,99'] } })
    expect(empty).not.toHaveProperty('rails')
    expect(empty).not.toHaveProperty('terrain')
    expect(load({ rails: 'x', terrain: 5 })).toEqual({ size: 10, roads: [], placements: [] })
  })
})
