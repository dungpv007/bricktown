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
  it('migrate accepts current version', () => {
    const save = createEmptySave()
    expect(migrate(save)).toEqual(save)
  })
})
