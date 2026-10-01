import { describe, expect, it } from 'vitest'
import { figPreset } from './figures'
import { DEFAULT_MAZE_WALL_COLOR, createEmptyMaze, type Maze } from './maze'
import { SCHEMA_VERSION, createEmptySave, exportSave, importSave, migrate } from './serialize'

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

  describe('sharing fields (schema 3)', () => {
    const base = { schemaVersion: SCHEMA_VERSION, blueprints: [], city: {}, workshop: {} }
    const template = {
      id: 'shared_1', name: { vi: 'Xe', en: 'Xe' }, difficulty: 1, kind: 'vehicle', tags: [], baseplate: { w: 8, d: 8 },
      bricks: [{ id: 'shared_1-0', p: 'minifig', x: 0, y: 0, z: 0, r: 0, c: 0, fig: figPreset('chef') }], steps: [[0]],
    }
    it('fills in the defaults for an older save', () => {
      const out = migrate(base)
      expect(out.sharedTemplates).toEqual([])
      expect(out.mazes).toEqual([])
      expect(out.mazeChallenges).toEqual({})
    })
    it('round-trips shared templates, mazes and challenges', () => {
      const save = createEmptySave()
      save.sharedTemplates = [template as never]
      save.mazes = [{ id: 'maze_1', name: 'm', w: 7, h: 7, walls: ['0,0'], entry: null, exit: null, coins: [], wallColor: 6, createdAt: 1, updatedAt: 1 }]
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
        ],
        mazes: [{ id: 'm' }, 'maze', null],
        mazeChallenges: { a: { timeMs: 10 }, b: { timeMs: -1 }, c: 'fast', d: { timeMs: 5, from: 7 }, e: { timeMs: NaN } },
      })
      const { fig: _fig, ...plain } = template.bricks[0]
      void _fig
      expect(out.sharedTemplates).toEqual([template, { ...template, bricks: [plain] }])
      expect(out.mazes).toEqual([]) // no valid size: see the maze tests below
      expect(out.mazeChallenges).toEqual({ a: { timeMs: 10 }, d: { timeMs: 5 } })
      expect(migrate({ ...base, sharedTemplates: 'x', mazes: {}, mazeChallenges: [] })).toMatchObject({ sharedTemplates: [], mazes: [], mazeChallenges: {} })
    })
  })
})

describe('serialize: mazes (schema 3)', () => {
  const maze = (extra: Partial<Maze> = {}): Maze => ({
    ...createEmptyMaze(7, 7, { id: 'm1', name: 'Mê cung 1', now: 5 }),
    walls: ['0,0', '1,0', '2,0'],
    entry: { cx: 0, cz: 1 },
    exit: { cx: 6, cz: 5 },
    coins: ['3,3'],
    ...extra,
  })

  it('loads a v2 save, adding no mazes and no records', () => {
    const v2: Record<string, unknown> = { ...createEmptySave(), schemaVersion: 2 }
    delete v2.mazes
    delete v2.mazeRecords
    const out = migrate(structuredClone(v2))
    expect(out.schemaVersion).toBe(3)
    expect(out.mazes).toEqual([])
    expect(out.mazeRecords).toEqual({})
    expect(importSave(JSON.stringify({ app: 'bricktown', ...v2 }))).toEqual(createEmptySave())
  })

  it('round-trips mazes and records', () => {
    const save = createEmptySave()
    const { floorColor: _f, ...noFloor } = maze({ id: 'm2', templateId: 'heart', wallColor: 29 })
    void _f
    save.mazes.push(maze(), noFloor)
    save.mazeRecords = { m1: { timeMs: 12345, stars: 3, coins: 2 }, 'tpl:easy': { timeMs: 900, stars: 1, coins: 0 } }
    expect(importSave(exportSave(save))).toEqual(save)
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
          walls: ['0,0', 'x', '9,9', 3, '-1,2', '1.5,2', '0,0'],
          coins: ['3,3', '99,1'],
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
    const { floorColor: _f, ...rest } = maze({ id: 'm3' })
    void _f
    expect(out.mazes[1]).toEqual({
      ...rest,
      name: '',
      walls: ['0,0'],
      coins: ['3,3'],
      entry: null,
      exit: null,
      wallColor: DEFAULT_MAZE_WALL_COLOR,
      createdAt: 0,
    })
    expect('floorColor' in out.mazes[1]).toBe(false)
    expect('templateId' in out.mazes[1]).toBe(false)
  })

  it('keeps only well-formed records', () => {
    const out = migrate({
      ...createEmptySave(),
      mazeRecords: {
        ok: { timeMs: 1000, stars: 2, coins: 1 },
        badStars: { timeMs: 1000, stars: 4, coins: 1 },
        badTime: { timeMs: -1, stars: 1, coins: 0 },
        badCoins: { timeMs: 1, stars: 1, coins: 1.5 },
        notObject: 5,
      },
    })
    expect(out.mazeRecords).toEqual({ ok: { timeMs: 1000, stars: 2, coins: 1 } })
    expect(migrate({ ...createEmptySave(), mazeRecords: [] }).mazeRecords).toEqual({})
    expect(migrate({ ...createEmptySave(), mazes: {} }).mazes).toEqual([])
  })
})
