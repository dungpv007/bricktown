import { describe, expect, it } from 'vitest'
import { figPreset } from './figures'
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
  it('is schema version 2', () => {
    expect(SCHEMA_VERSION).toBe(2)
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
    expect(importSave(json)).toEqual({ ...v1, schemaVersion: 2 })
    expect(migrate(structuredClone(v1))).toEqual({ ...v1, schemaVersion: 2 })
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
  it('round-trips figures with their style (an additive field: still schema 2)', () => {
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
})
