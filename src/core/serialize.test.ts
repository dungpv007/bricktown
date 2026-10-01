import { describe, expect, it } from 'vitest'
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
})
